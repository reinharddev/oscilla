-- Assistant chat history, kept per user so it survives page changes and reloads.
create table public.agent_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (length(content) between 1 and 8000),
  reply jsonb,
  created_at timestamptz not null default now()
);
create index agent_messages_user_idx on public.agent_messages (user_id, created_at desc);

alter table public.agent_messages enable row level security;
create policy agent_messages_select on public.agent_messages for select to authenticated
  using (user_id = (select auth.uid()));
create policy agent_messages_insert on public.agent_messages for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy agent_messages_delete on public.agent_messages for delete to authenticated
  using (user_id = (select auth.uid()));
grant select, insert, delete on public.agent_messages to authenticated;
grant all on public.agent_messages to service_role;
