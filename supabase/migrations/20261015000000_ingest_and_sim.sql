-- Ingest path and dummy-sensor state.
--   * health_snapshots now says where a reading came from and keeps the companion channels.
--   * asset_baselines: each machine's learned healthy baseline, so the health service stays stateless.
--   * sim_state: the damage level of a simulated machine. Only the server touches it. It exists so the
--     dummy sensors behave like a machine: slow wear, and a repair (work order done) resets it.

alter table public.health_snapshots
  add column source text not null default 'sensor' check (source in ('sensor', 'simulator')),
  add column aux jsonb not null default '{}'::jsonb;

create table public.asset_baselines (
  asset_id uuid primary key,
  org_id uuid not null,
  warehouse_id uuid not null,
  model_version text not null,
  payload jsonb not null,
  learned_at timestamptz not null default now(),
  foreign key (asset_id, org_id, warehouse_id) references public.assets (id, org_id, warehouse_id) on delete cascade
);

create table public.sim_state (
  asset_id uuid primary key references public.assets (id) on delete cascade,
  severity numeric not null check (severity between 0 and 1),
  rate_per_day numeric not null default 0 check (rate_per_day >= 0),
  anchor_at timestamptz not null default now(),
  last_tick_at timestamptz not null default 'epoch'
);

revoke all on public.asset_baselines, public.sim_state from anon, authenticated;
grant select on public.asset_baselines to authenticated;
grant all on public.asset_baselines, public.sim_state to service_role;

alter table public.asset_baselines enable row level security;
alter table public.sim_state enable row level security; -- no policy: only the service role can use it

create policy baseline_select on public.asset_baselines for select to authenticated
  using ((select private.has_role(org_id, warehouse_id, array['admin', 'manager', 'technician', 'viewer'])));

-- A finished work order means the machine was repaired: wear starts again from a healthy level.
create or replace function private.reset_sim_after_repair()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.sim_state
     set severity = 0.02,
         rate_per_day = least(rate_per_day, 0.004),
         anchor_at = now(),
         last_tick_at = 'epoch'
   where asset_id = new.asset_id;
  return new;
end;
$$;

create trigger work_orders_reset_sim after update of status on public.work_orders
  for each row when (new.status = 'done' and old.status is distinct from 'done')
  execute function private.reset_sim_after_repair();
