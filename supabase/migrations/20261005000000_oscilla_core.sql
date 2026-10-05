-- Oscilla core schema: organization -> warehouse -> asset, with role-based access.
--
-- Access model
--   * A user belongs to one organization through `memberships`.
--   * A membership carries a role (admin | manager | technician | viewer) and an optional
--     warehouse. warehouse_id NULL means "every warehouse in the organization".
--   * `admin` is always organization-wide.
--   * Every rule below is enforced by Postgres row-level security, not by the UI, so a
--     hand-crafted API call cannot read or write more than the user's role allows.
--   * Rows written by the ingest pipeline (health snapshots) use the service role, which
--     bypasses RLS; no end user can insert them.


-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 120),
  created_at timestamptz not null default now()
);

create table public.warehouses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (length(name) between 1 and 120),
  timezone text not null default 'UTC',
  -- Layout is data, not code: zones, racks, conveyors and routes are drawn from this.
  layout jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (id, org_id)
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  org_id uuid references public.organizations (id) on delete set null,
  full_name text not null default '',
  created_at timestamptz not null default now()
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  warehouse_id uuid,
  role text not null check (role in ('admin', 'manager', 'technician', 'viewer')),
  created_at timestamptz not null default now(),
  foreign key (warehouse_id, org_id) references public.warehouses (id, org_id) on delete cascade,
  constraint admin_is_org_wide check (role <> 'admin' or warehouse_id is null)
);
create unique index memberships_unique
  on public.memberships (user_id, org_id, coalesce(warehouse_id, '00000000-0000-0000-0000-000000000000'::uuid), role);
create index memberships_user_idx on public.memberships (user_id);

create table public.assets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  warehouse_id uuid not null,
  serial_number text not null check (length(serial_number) between 1 and 80),
  name text not null,
  type text not null check (type in ('forklift', 'agv', 'drone', 'conveyor', 'robot_arm', 'other')),
  manufacturer text,
  model text,
  zone text,
  position jsonb not null default '{}'::jsonb,
  -- Which sensor sits on which component, e.g. [{"id":"acc-1","component":"front wheel motor","kind":"accelerometer"}]
  sensors jsonb not null default '[]'::jsonb,
  rpm numeric check (rpm is null or rpm > 0),
  created_at timestamptz not null default now(),
  foreign key (warehouse_id, org_id) references public.warehouses (id, org_id) on delete cascade,
  unique (org_id, serial_number),
  unique (id, org_id, warehouse_id)
);
create index assets_warehouse_idx on public.assets (warehouse_id);

create table public.health_snapshots (
  id bigint generated always as identity primary key,
  asset_id uuid not null,
  org_id uuid not null,
  warehouse_id uuid not null,
  taken_at timestamptz not null default now(),
  score numeric not null check (score between 0 and 100),
  status text not null check (status in ('healthy', 'attention', 'critical')),
  features jsonb not null default '{}'::jsonb,
  evidence jsonb not null default '[]'::jsonb,
  model_version text,
  foreign key (asset_id, org_id, warehouse_id) references public.assets (id, org_id, warehouse_id) on delete cascade
);
create index health_snapshots_asset_idx on public.health_snapshots (asset_id, taken_at desc);

create table public.work_orders (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null,
  org_id uuid not null,
  warehouse_id uuid not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'in_progress', 'done', 'cancelled')),
  summary text not null check (length(summary) between 1 and 2000),
  due_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_by uuid not null default auth.uid() references auth.users (id),
  assigned_to uuid references auth.users (id),
  -- What the AI said when the order was raised, and whether the technician agreed afterwards.
  ai_diagnosis jsonb,
  diagnosis_feedback text check (diagnosis_feedback in ('correct', 'incorrect')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (asset_id, org_id, warehouse_id) references public.assets (id, org_id, warehouse_id) on delete cascade
);
create index work_orders_asset_idx on public.work_orders (asset_id, created_at desc);

create table public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null,
  org_id uuid not null,
  warehouse_id uuid not null,
  author_id uuid not null default auth.uid() references auth.users (id),
  kind text not null default 'note' check (kind in ('note', 'alert', 'schedule', 'start', 'done')),
  body text not null check (length(body) between 1 and 4000),
  created_at timestamptz not null default now(),
  foreign key (asset_id, org_id, warehouse_id) references public.assets (id, org_id, warehouse_id) on delete cascade
);
create index journal_asset_idx on public.journal_entries (asset_id, created_at desc);

create table public.audit_log (
  id bigint generated always as identity primary key,
  org_id uuid not null,
  warehouse_id uuid,
  actor_id uuid,
  action text not null,
  entity text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_org_idx on public.audit_log (org_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Access helpers (private schema: not exposed through the public API)
-- ---------------------------------------------------------------------------

create schema if not exists private;
grant usage on schema private to authenticated;

-- True when the caller holds one of `p_roles` for the warehouse. Pass p_warehouse = NULL to
-- ask for an organization-wide role.
create or replace function private.has_role(p_org uuid, p_warehouse uuid, p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    where m.user_id = (select auth.uid())
      and m.org_id = p_org
      and (m.warehouse_id is null or m.warehouse_id = p_warehouse)
      and m.role = any (p_roles)
  );
$$;

create or replace function private.is_org_member(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.user_id = (select auth.uid()) and m.org_id = p_org
  );
$$;

grant execute on function private.has_role(uuid, uuid, text[]) to authenticated;
grant execute on function private.is_org_member(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Audit trail and housekeeping triggers
-- ---------------------------------------------------------------------------

create or replace function private.audit_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  rec jsonb := to_jsonb(coalesce(new, old));
begin
  insert into public.audit_log (org_id, warehouse_id, actor_id, action, entity, entity_id, details)
  values (
    (rec ->> 'org_id')::uuid,
    nullif(rec ->> 'warehouse_id', '')::uuid,
    (select auth.uid()),
    tg_op,
    tg_table_name,
    rec ->> 'id',
    jsonb_build_object('new', to_jsonb(new), 'old', to_jsonb(old))
  );
  return coalesce(new, old);
end;
$$;

create trigger audit_work_orders after insert or update or delete on public.work_orders
  for each row execute function private.audit_change();
create trigger audit_journal after insert on public.journal_entries
  for each row execute function private.audit_change();
create trigger audit_memberships after insert or update or delete on public.memberships
  for each row execute function private.audit_change();
create trigger audit_assets after insert or update or delete on public.assets
  for each row execute function private.audit_change();

create or replace function private.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
create trigger work_orders_touch before update on public.work_orders
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Privileges: deny by default, then grant only what row-level security refines.
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

grant usage on schema public to authenticated;
grant select on public.organizations, public.warehouses, public.profiles, public.memberships,
  public.assets, public.health_snapshots, public.audit_log to authenticated;
grant update on public.organizations, public.warehouses, public.assets to authenticated;
grant insert, delete on public.warehouses, public.assets, public.memberships to authenticated;
grant update on public.memberships, public.profiles to authenticated;
grant select, insert, update, delete on public.work_orders to authenticated;
grant select, insert on public.journal_entries to authenticated;

grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.organizations enable row level security;
alter table public.warehouses enable row level security;
alter table public.profiles enable row level security;
alter table public.memberships enable row level security;
alter table public.assets enable row level security;
alter table public.health_snapshots enable row level security;
alter table public.work_orders enable row level security;
alter table public.journal_entries enable row level security;
alter table public.audit_log enable row level security;

-- organizations
create policy org_select on public.organizations for select to authenticated
  using ((select private.is_org_member(id)));
create policy org_update on public.organizations for update to authenticated
  using ((select private.has_role(id, null, array['admin'])))
  with check ((select private.has_role(id, null, array['admin'])));

-- warehouses: anyone with a role there can read; managers edit their own; admins create/delete.
create policy wh_select on public.warehouses for select to authenticated
  using ((select private.has_role(org_id, id, array['admin', 'manager', 'technician', 'viewer'])));
create policy wh_insert on public.warehouses for insert to authenticated
  with check ((select private.has_role(org_id, null, array['admin'])));
create policy wh_update on public.warehouses for update to authenticated
  using ((select private.has_role(org_id, id, array['admin', 'manager'])))
  with check ((select private.has_role(org_id, id, array['admin', 'manager'])));
create policy wh_delete on public.warehouses for delete to authenticated
  using ((select private.has_role(org_id, null, array['admin'])));

-- profiles: colleagues can see each other; everyone edits only their own.
create policy profile_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (org_id is not null and (select private.is_org_member(org_id))));
create policy profile_update on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- memberships: you see your own; only org admins see and change everyone's.
create policy member_select on public.memberships for select to authenticated
  using (user_id = (select auth.uid()) or (select private.has_role(org_id, null, array['admin'])));
create policy member_insert on public.memberships for insert to authenticated
  with check ((select private.has_role(org_id, null, array['admin'])));
create policy member_update on public.memberships for update to authenticated
  using ((select private.has_role(org_id, null, array['admin'])))
  with check ((select private.has_role(org_id, null, array['admin'])));
create policy member_delete on public.memberships for delete to authenticated
  using ((select private.has_role(org_id, null, array['admin'])));

-- assets
create policy asset_select on public.assets for select to authenticated
  using ((select private.has_role(org_id, warehouse_id, array['admin', 'manager', 'technician', 'viewer'])));
create policy asset_insert on public.assets for insert to authenticated
  with check ((select private.has_role(org_id, warehouse_id, array['admin', 'manager'])));
create policy asset_update on public.assets for update to authenticated
  using ((select private.has_role(org_id, warehouse_id, array['admin', 'manager'])))
  with check ((select private.has_role(org_id, warehouse_id, array['admin', 'manager'])));
create policy asset_delete on public.assets for delete to authenticated
  using ((select private.has_role(org_id, null, array['admin'])));

-- health snapshots: read-only for users; the ingest service writes them with the service role.
create policy health_select on public.health_snapshots for select to authenticated
  using ((select private.has_role(org_id, warehouse_id, array['admin', 'manager', 'technician', 'viewer'])));

-- work orders: viewers read; technicians and above create and update; only admins delete.
create policy wo_select on public.work_orders for select to authenticated
  using ((select private.has_role(org_id, warehouse_id, array['admin', 'manager', 'technician', 'viewer'])));
create policy wo_insert on public.work_orders for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and (select private.has_role(org_id, warehouse_id, array['admin', 'manager', 'technician']))
  );
create policy wo_update on public.work_orders for update to authenticated
  using ((select private.has_role(org_id, warehouse_id, array['admin', 'manager', 'technician'])))
  with check ((select private.has_role(org_id, warehouse_id, array['admin', 'manager', 'technician'])));
create policy wo_delete on public.work_orders for delete to authenticated
  using ((select private.has_role(org_id, null, array['admin'])));

-- journal: append-only. Authors cannot be spoofed and entries cannot be edited or removed.
create policy journal_select on public.journal_entries for select to authenticated
  using ((select private.has_role(org_id, warehouse_id, array['admin', 'manager', 'technician', 'viewer'])));
create policy journal_insert on public.journal_entries for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and (select private.has_role(org_id, warehouse_id, array['admin', 'manager', 'technician']))
  );

-- audit log: managers and admins read; nobody writes directly (triggers only).
create policy audit_select on public.audit_log for select to authenticated
  using ((select private.has_role(org_id, warehouse_id, array['admin', 'manager'])));
