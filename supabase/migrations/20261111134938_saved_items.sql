-- Stage 2 Discovery: saved products and suppliers for signed-in users (guests keep browser storage).
-- The primary key makes saving idempotent: insert ... on conflict do nothing.

create type public.saved_kind as enum ('product', 'supplier');

create table public.saved_items (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  kind public.saved_kind not null,
  target_id uuid not null, -- products.id or suppliers.id; readers join to what is still visible
  created_at timestamptz not null default now(),
  primary key (user_id, kind, target_id)
);

revoke all on public.saved_items from anon, authenticated;
grant select, delete on public.saved_items to authenticated;
grant insert (kind, target_id) on public.saved_items to authenticated;

alter table public.saved_items enable row level security;

create policy "saved_items: own rows" on public.saved_items for select to authenticated
  using (user_id = (select auth.uid()));
create policy "saved_items: add own while active" on public.saved_items for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.is_active_user()));
create policy "saved_items: remove own" on public.saved_items for delete to authenticated
  using (user_id = (select auth.uid()));
