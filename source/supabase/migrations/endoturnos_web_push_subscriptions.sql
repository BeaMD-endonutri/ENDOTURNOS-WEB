create table if not exists public.et_push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  p256dh text not null,
  auth_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint et_push_endpoint_https check (endpoint like 'https://%')
);
create index if not exists et_push_subscriptions_user_id_idx on public.et_push_subscriptions(user_id);
alter table public.et_push_subscriptions enable row level security;
create policy "Own push subscriptions visible" on public.et_push_subscriptions for select to authenticated using (user_id = (select auth.uid()));
create policy "Own push subscriptions insert" on public.et_push_subscriptions for insert to authenticated with check (user_id = (select auth.uid()) and exists (select 1 from public.et_staff s where s.user_id = (select auth.uid()) and s.active));
create policy "Own push subscriptions update" on public.et_push_subscriptions for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Own push subscriptions delete" on public.et_push_subscriptions for delete to authenticated using (user_id = (select auth.uid()));
grant select, insert, update, delete on public.et_push_subscriptions to authenticated;
grant all on public.et_push_subscriptions to service_role;
create or replace function public.et_push_vapid_private()
returns text language sql security definer set search_path = ''
as $$ select decrypted_secret from vault.decrypted_secrets where name = 'endoturnos_vapid_private' limit 1 $$;
revoke all on function public.et_push_vapid_private() from public, anon, authenticated;
grant execute on function public.et_push_vapid_private() to service_role;
