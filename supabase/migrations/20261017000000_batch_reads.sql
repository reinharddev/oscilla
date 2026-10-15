-- Fewer round trips. One call returns the recent readings of many machines, and the simulator
-- claims all its due ticks in one statement instead of several requests per machine.

-- Last p_limit readings per machine, oldest first. Runs as the caller, so row-level security applies.
create or replace function public.health_history(p_asset_ids uuid[], p_limit int default 60)
returns table (asset_id uuid, taken_at timestamptz, score numeric, status text, evidence jsonb, model_version text, source text, aux jsonb)
language sql
stable
security invoker
set search_path = ''
as $$
  select r.asset_id, r.taken_at, r.score, r.status, r.evidence, r.model_version, r.source, r.aux
  from (
    select s.*, row_number() over (partition by s.asset_id order by s.taken_at desc) as rn
    from public.health_snapshots s
    where s.asset_id = any (p_asset_ids)
  ) r
  where r.rn <= greatest(1, least(p_limit, 200))
  order by r.asset_id, r.taken_at;
$$;
grant execute on function public.health_history(uuid[], int) to authenticated;

-- Marks the machines whose last simulated reading is older than the cutoff (or all of them when
-- forced) and returns their damage state. Machines without a state start lightly worn.
-- Two callers racing each get a disjoint set, so a reading is produced once.
create or replace function public.claim_sim_ticks(p_asset_ids uuid[], p_cutoff timestamptz, p_force boolean default false)
returns table (asset_id uuid, severity numeric, rate_per_day numeric, anchor_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.sim_state (asset_id, severity, rate_per_day)
  select a, 0.05, 0 from unnest(p_asset_ids) as a
  where exists (select 1 from public.assets x where x.id = a)
  on conflict on constraint sim_state_pkey do nothing;

  return query
  update public.sim_state s
     set last_tick_at = now()
   where s.asset_id = any (p_asset_ids)
     and (p_force or s.last_tick_at < p_cutoff)
  returning s.asset_id, s.severity, s.rate_per_day, s.anchor_at;
end;
$$;
revoke all on function public.claim_sim_ticks(uuid[], timestamptz, boolean) from public, anon, authenticated;
grant execute on function public.claim_sim_ticks(uuid[], timestamptz, boolean) to service_role;
