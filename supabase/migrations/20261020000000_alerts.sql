-- Alerts: one active alert per machine, raised when a reading moves a machine out of "healthy"
-- (or from attention to critical) and closed when it is healthy again. Raised by a trigger on
-- health_snapshots so the real ingest path and the dummy sensors behave the same.

create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  warehouse_id uuid not null,
  asset_id uuid not null,
  severity text not null check (severity in ('attention', 'critical')),
  score numeric not null,
  headline text not null default '',
  rul_days numeric,
  status text not null default 'open' check (status in ('open', 'acknowledged', 'resolved')),
  created_at timestamptz not null default now(),
  acknowledged_by uuid references auth.users (id),
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  foreign key (asset_id, org_id, warehouse_id) references public.assets (id, org_id, warehouse_id) on delete cascade
);
create unique index alerts_one_active_per_asset on public.alerts (asset_id) where status <> 'resolved';
create index alerts_warehouse_idx on public.alerts (warehouse_id, created_at desc);

alter table public.alerts enable row level security;
create policy alerts_select on public.alerts for select to authenticated
  using ((select private.has_role(org_id, warehouse_id, array['admin', 'manager', 'technician', 'viewer'])));
grant select on public.alerts to authenticated;
grant all on public.alerts to service_role;

create or replace function private.alert_from_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  active public.alerts;
  top text := coalesce(new.evidence -> 0 ->> 'label', '');
begin
  select * into active from public.alerts where asset_id = new.asset_id and status <> 'resolved';

  if new.status = 'healthy' then
    if found then
      update public.alerts set status = 'resolved', resolved_at = now() where id = active.id;
    end if;
    return new;
  end if;

  if not found then
    insert into public.alerts (org_id, warehouse_id, asset_id, severity, score, headline)
    values (new.org_id, new.warehouse_id, new.asset_id, new.status, new.score, top);
  elsif active.severity = 'attention' and new.status = 'critical' then
    -- Escalation re-opens the alert so it is seen again.
    update public.alerts
       set severity = 'critical', score = new.score, headline = top, status = 'open',
           acknowledged_by = null, acknowledged_at = null
     where id = active.id;
  end if;
  return new;
end;
$$;

create trigger health_snapshots_alert after insert on public.health_snapshots
  for each row execute function private.alert_from_snapshot();

create or replace function public.acknowledge_alert(p_alert uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.alerts;
begin
  select * into a from public.alerts where id = p_alert;
  if not found or not private.has_role(a.org_id, a.warehouse_id, array['admin', 'manager', 'technician']) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  update public.alerts
     set status = 'acknowledged', acknowledged_by = (select auth.uid()), acknowledged_at = now()
   where id = p_alert and status = 'open';
end;
$$;
revoke all on function public.acknowledge_alert(uuid) from public, anon;
grant execute on function public.acknowledge_alert(uuid) to authenticated;

-- Machines that are already flagged when this migration runs.
insert into public.alerts (org_id, warehouse_id, asset_id, severity, score, headline)
select s.org_id, s.warehouse_id, s.asset_id, s.status, s.score, coalesce(s.evidence -> 0 ->> 'label', '')
from (
  select distinct on (asset_id) * from public.health_snapshots order by asset_id, taken_at desc
) s
where s.status <> 'healthy'
on conflict do nothing;
