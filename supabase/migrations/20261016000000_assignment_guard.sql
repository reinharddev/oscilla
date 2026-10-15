-- Who may assign work, and a way for managers to see who can be assigned.
--
--   * Technicians may only take a task for themselves (or give back one that is theirs).
--   * Managers and admins may assign anyone who works in that warehouse.
--   * An assignee must be an admin, manager or technician with access to the warehouse.

create or replace function private.guard_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  is_lead boolean;
begin
  -- Changes made outside a user session (service role, migrations) are not checked.
  if me is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.assigned_to is not distinct from old.assigned_to then
    return new;
  end if;
  if tg_op = 'INSERT' and new.assigned_to is null then
    return new;
  end if;

  is_lead := private.has_role(new.org_id, new.warehouse_id, array['admin', 'manager']);
  if not is_lead then
    -- A technician may claim a task for themselves or release one that is theirs.
    if not (
      private.has_role(new.org_id, new.warehouse_id, array['technician'])
      and (
        new.assigned_to = me
        or (new.assigned_to is null and tg_op = 'UPDATE' and old.assigned_to = me)
      )
    ) then
      raise exception 'assignment_not_allowed' using errcode = '42501';
    end if;
  end if;

  if new.assigned_to is not null and not exists (
    select 1 from public.memberships m
    where m.user_id = new.assigned_to
      and m.org_id = new.org_id
      and (m.warehouse_id is null or m.warehouse_id = new.warehouse_id)
      and m.role in ('admin', 'manager', 'technician')
  ) then
    raise exception 'assignee_not_in_warehouse' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger work_orders_guard_assignment before insert or update of assigned_to on public.work_orders
  for each row execute function private.guard_assignment();

-- People who can be assigned in a warehouse. Managers and admins only: memberships themselves
-- stay admin-only, this exposes just name and role for the warehouse the caller leads.
create or replace function public.warehouse_people(p_warehouse uuid)
returns table (user_id uuid, full_name text, role text)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct on (m.user_id) m.user_id, coalesce(p.full_name, '') as full_name, m.role
  from public.warehouses w
  join public.memberships m on m.org_id = w.org_id and (m.warehouse_id is null or m.warehouse_id = w.id)
  left join public.profiles p on p.id = m.user_id
  where w.id = p_warehouse
    and m.role in ('admin', 'manager', 'technician')
    and private.has_role(w.org_id, w.id, array['admin', 'manager'])
  order by m.user_id, case m.role when 'admin' then 0 when 'manager' then 1 else 2 end;
$$;

revoke all on function public.warehouse_people(uuid) from public, anon;
grant execute on function public.warehouse_people(uuid) to authenticated;
