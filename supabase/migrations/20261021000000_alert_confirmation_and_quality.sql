-- Alerts become steadier and cover sensors, not only machines.
--
--   * A health alert needs two consecutive readings out of range, so one noisy window does not
--     raise (or escalate) an alert; it closes after two consecutive healthy readings.
--   * "data_quality" alerts say that a sensor delivered a window that could not be trusted
--     (flatline, clipping, dropout). They close when readings arrive again.

alter table public.alerts
  add column kind text not null default 'health' check (kind in ('health', 'data_quality'));

drop index public.alerts_one_active_per_asset;
create unique index alerts_one_active_per_asset_kind on public.alerts (asset_id, kind) where status <> 'resolved';

create or replace function private.alert_from_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  active public.alerts;
  prev text;
  top text := coalesce(new.evidence -> 0 ->> 'label', '');
begin
  -- A reading arrived, so the sensor is delivering again.
  update public.alerts
     set status = 'resolved', resolved_at = now()
   where asset_id = new.asset_id and kind = 'data_quality' and status <> 'resolved';

  -- The reading before this one (this one is already stored).
  select s.status into prev
  from public.health_snapshots s
  where s.asset_id = new.asset_id and s.id < new.id
  order by s.taken_at desc, s.id desc
  limit 1;

  select * into active from public.alerts
   where asset_id = new.asset_id and kind = 'health' and status <> 'resolved';

  if new.status = 'healthy' then
    if found and prev = 'healthy' then
      update public.alerts set status = 'resolved', resolved_at = now() where id = active.id;
    end if;
    return new;
  end if;

  -- Out of range now; act only if the previous reading was out of range too.
  if prev is null or prev = 'healthy' then
    return new;
  end if;

  if not found then
    insert into public.alerts (org_id, warehouse_id, asset_id, severity, score, headline)
    values (new.org_id, new.warehouse_id, new.asset_id,
            case when new.status = 'critical' and prev = 'critical' then 'critical' else 'attention' end,
            new.score, top);
  elsif active.severity = 'attention' and new.status = 'critical' and prev = 'critical' then
    update public.alerts
       set severity = 'critical', score = new.score, headline = top, status = 'open',
           acknowledged_by = null, acknowledged_at = null
     where id = active.id;
  end if;
  return new;
end;
$$;
