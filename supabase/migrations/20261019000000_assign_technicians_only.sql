-- Work is assigned to technicians only: they are the role with a task screen, so a task given to
-- a manager or admin would be invisible to them. Managers and admins still decide who gets what.

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
      and m.role = 'technician'
  ) then
    raise exception 'assignee_not_in_warehouse' using errcode = '23514';
  end if;
  return new;
end;
$$;
