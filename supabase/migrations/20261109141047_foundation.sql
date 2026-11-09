-- Stage 1 Foundation: accounts, admin sub-roles, supplier verification, categories,
-- admin settings, commission schedule (0% for Q1 2027 testing) and the audit log.
--
-- Access model: RLS on every table. Users write their own profile directly (column grants);
-- everything with a state change (supplier status, roles, settings, commission) goes through
-- the security-definer functions below, which check the caller and write history + audit rows.
-- Admin rights need an admin sub-role AND an MFA session (aal2).

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create type public.user_role as enum ('buyer', 'supplier', 'admin');
create type public.account_status as enum ('active', 'suspended');
create type public.admin_sub_role as enum ('verifier', 'support', 'finance', 'super_admin');
create type public.supplier_status as enum ('pending', 'under_review', 'verified', 'rejected', 'suspended', 'restricted');
create type public.supplier_document_kind as enum ('dti_sec', 'bir', 'mayors_permit', 'valid_id', 'other');

-- ---------------------------------------------------------------- shared triggers

create function private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create function private.forbid_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception '% is append-only; add a reversing row instead', tg_table_name using errcode = '42501';
end $$;

-- ---------------------------------------------------------------- accounts

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null default '',
  role public.user_role not null,
  status public.account_status not null default 'active',
  full_name text not null default '' check (char_length(full_name) <= 100),
  phone text not null default '' check (phone = '' or phone ~ '^09[0-9]{9}$'),
  business_name text not null default '' check (char_length(business_name) <= 150),
  industry text not null default '' check (char_length(industry) <= 150),
  city text not null default '' check (char_length(city) <= 150),
  province text not null default '' check (char_length(province) <= 150),
  website text not null default '' check (website = '' or (website ~ '^https://' and char_length(website) <= 300)),
  about text not null default '' check (char_length(about) <= 900),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_touch before update on public.profiles
  for each row execute function private.touch_updated_at();

-- Sign-up picks buyer or supplier. Admin is never self-assigned: only admin_grant_role makes admins.
create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, role, full_name)
  values (
    new.id,
    coalesce(new.email, ''),
    case when new.raw_user_meta_data ->> 'role' = 'supplier' then 'supplier' else 'buyer' end::public.user_role,
    left(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), 100)
  );
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

create function private.sync_profile_email() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set email = coalesce(new.email, '') where id = new.id;
  return new;
end $$;
create trigger on_auth_user_email_changed after update of email on auth.users
  for each row execute function private.sync_profile_email();

create table public.admin_roles (
  user_id uuid not null references public.profiles (id) on delete cascade,
  sub_role public.admin_sub_role not null,
  granted_by uuid,
  granted_at timestamptz not null default now(),
  primary key (user_id, sub_role)
);

-- ---------------------------------------------------------------- access helpers (used by RLS)

create function public.is_active_user() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and status = 'active');
$$;

-- True when the caller holds one of the given sub-roles (super_admin holds all) on an MFA session.
create function public.has_admin_role(variadic roles public.admin_sub_role[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
     and exists (
       select 1
       from public.admin_roles ar
       join public.profiles p on p.id = ar.user_id
       where ar.user_id = auth.uid()
         and p.role = 'admin'
         and p.status = 'active'
         and (ar.sub_role = any (roles) or ar.sub_role = 'super_admin')
     );
$$;

create function public.is_admin() returns boolean
language sql stable set search_path = '' as $$
  select public.has_admin_role('verifier', 'support', 'finance', 'super_admin');
$$;

-- ---------------------------------------------------------------- audit log

create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid, -- no FK: the log must outlive deleted accounts
  action text not null,
  target_table text not null,
  target_id text not null,
  details jsonb not null default '{}',
  ip text,
  created_at timestamptz not null default now()
);
create index audit_log_target_idx on public.audit_log (target_table, target_id);
create index audit_log_created_idx on public.audit_log (created_at desc);

-- shortcut: IP is the first X-Forwarded-For hop PostgREST sees; through Server Actions that is the app server, not the user. Forward the client IP once Sentry/rate limits need it.
create function private.audit(p_action text, p_table text, p_id text, p_details jsonb default '{}') returns void
language sql security definer set search_path = '' as $$
  insert into public.audit_log (actor_id, action, target_table, target_id, details, ip)
  values (
    auth.uid(), p_action, p_table, p_id, coalesce(p_details, '{}'),
    nullif(btrim(split_part(coalesce(nullif(current_setting('request.headers', true), '')::json ->> 'x-forwarded-for', ''), ',', 1)), '')
  );
$$;

-- ---------------------------------------------------------------- catalog reference data

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name text not null check (char_length(name) between 1 and 100),
  parent_id uuid references public.categories (id),
  sort_order integer not null default 0,
  active boolean not null default true
);

insert into public.categories (slug, name, sort_order) values
  ('custom-shirts', 'Custom shirts', 1),
  ('dtf-prints', 'DTF prints', 2),
  ('sublimation', 'Sublimation', 3),
  ('packaging', 'Packaging', 4),
  ('customized-mugs', 'Customized mugs', 5),
  ('customized-ids', 'Customized IDs', 6);

-- Legacy categories live on as Packaging subcategories.
insert into public.categories (slug, name, parent_id, sort_order)
select v.slug, v.name, (select id from public.categories where slug = 'packaging'), v.ord
from (values
  ('pouches', 'Pouches & flexible packaging', 1),
  ('boxes', 'Boxes & cartons', 2),
  ('bottles', 'Bottles & jars', 3),
  ('labels', 'Labels & stickers', 4),
  ('food-containers', 'Cups & food containers', 5),
  ('paper-bags', 'Paper bags', 6),
  ('mailers', 'Mailer packaging', 7),
  ('other', 'Other packaging', 8)
) as v (slug, name, ord);

-- ---------------------------------------------------------------- suppliers

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references public.profiles (id),
  business_name text not null check (char_length(business_name) between 1 and 150),
  legal_name text not null check (char_length(legal_name) between 1 and 150),
  category_id uuid not null references public.categories (id),
  city text not null check (char_length(city) between 1 and 100),
  province text not null check (char_length(province) between 1 and 100),
  moq integer not null check (moq between 1 and 10000000),
  lead_days integer not null check (lead_days between 1 and 365),
  description text not null check (char_length(description) between 1 and 1600),
  status public.supplier_status not null default 'pending',
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index suppliers_status_idx on public.suppliers (status);
create trigger suppliers_touch before update on public.suppliers
  for each row execute function private.touch_updated_at();

create table public.supplier_status_history (
  id bigint generated always as identity primary key,
  supplier_id uuid not null references public.suppliers (id),
  from_status public.supplier_status,
  to_status public.supplier_status not null,
  reason text not null default '',
  actor_id uuid,
  created_at timestamptz not null default now()
);
create index supplier_status_history_supplier_idx on public.supplier_status_history (supplier_id, created_at);

-- Files live in the private `supplier-documents` bucket at <supplier_id>/<file>. Rows are evidence: never edited.
create table public.supplier_documents (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers (id),
  kind public.supplier_document_kind not null,
  storage_path text not null unique check (split_part(storage_path, '/', 1) = supplier_id::text),
  file_name text not null check (char_length(file_name) between 1 and 200),
  uploaded_by uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);
create index supplier_documents_supplier_idx on public.supplier_documents (supplier_id);

-- ---------------------------------------------------------------- admin settings

-- Business values (windows, limits, fees) the app reads instead of hardcoding. Integers only for numbers.
create table public.platform_settings (
  key text primary key check (key ~ '^[a-z0-9_]+$'),
  value jsonb not null,
  description text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

insert into public.platform_settings (key, value, description) values
  ('payout_delay_days', '7', 'Days after delivery before a supplier payout is released.'),
  ('report_window_damage_days', '5', 'Days after delivery to report transit damage, wrong or missing items.'),
  ('report_window_return_days', '30', 'Days after delivery to return a standard item.'),
  ('report_window_defect_days', '60', 'Days after delivery to report print defects (peeling, cracking, fading).'),
  ('custom_cancel_window_hours', '24', 'OPEN ITEM (2 or 24): backstop hours to cancel a custom order before proof approval.'),
  ('cod_downpayment_bps', '5000', 'OPEN ITEM: online downpayment for custom-printed COD orders, in basis points (5000 = 50%).'),
  ('cod_max_order_centavos', '0', 'OPEN ITEM: largest COD order in centavos. 0 = COD off until set.'),
  ('rfq_max_per_day', '5', 'RFQs one buyer can submit per day.'),
  ('support_email', '""', 'OPEN ITEM: public support email address.');

-- ---------------------------------------------------------------- commission

-- Rates are basis points (100 = 1%). Rows are scheduled in advance and never edited.
-- The rate in force at checkout gets frozen on each order (Stage 4).
create table public.commission_schedules (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.categories (id), -- null = all categories
  rate_bps integer not null check (rate_bps between 0 and 10000),
  starts_at timestamptz not null,
  note text not null default '' check (char_length(note) <= 300),
  created_by uuid,
  created_at timestamptz not null default now(),
  unique nulls not distinct (category_id, starts_at)
);

insert into public.commission_schedules (rate_bps, starts_at, note)
values (0, '2026-01-01 00:00:00+08', 'Q1 2027 testing: zero commission.');

-- Latest schedule that has started wins; on the same start time a category row beats the global one.
create function public.commission_rate_bps(p_category_id uuid, p_at timestamptz default now()) returns integer
language sql stable set search_path = '' as $$
  select coalesce((
    select rate_bps from public.commission_schedules
    where starts_at <= p_at and (category_id is null or category_id = p_category_id)
    order by starts_at desc, (category_id is null) asc
    limit 1
  ), 0);
$$;

-- ---------------------------------------------------------------- append-only guards

create trigger audit_log_append_only before update or delete on public.audit_log
  for each row execute function private.forbid_change();
create trigger audit_log_no_truncate before truncate on public.audit_log
  for each statement execute function private.forbid_change();
create trigger supplier_status_history_append_only before update or delete on public.supplier_status_history
  for each row execute function private.forbid_change();
create trigger supplier_documents_append_only before update or delete on public.supplier_documents
  for each row execute function private.forbid_change();
create trigger commission_schedules_append_only before update or delete on public.commission_schedules
  for each row execute function private.forbid_change();

-- ---------------------------------------------------------------- server-side actions

create function private.require_user() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  if not public.is_active_user() then
    raise exception 'This account is suspended' using errcode = '42501';
  end if;
  return uid;
end $$;

-- Create or resubmit the caller's supplier application. One application per owner, so a retried
-- call updates the same row instead of creating a second one (idempotent by owner).
create function public.submit_supplier_application(
  p_business_name text,
  p_legal_name text,
  p_category_slug text,
  p_city text,
  p_province text,
  p_moq integer,
  p_lead_days integer,
  p_description text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_user();
  cat uuid;
  sup public.suppliers;
begin
  if (select role from public.profiles where id = uid) <> 'supplier' then
    raise exception 'Only supplier accounts can apply' using errcode = '42501';
  end if;

  select id into cat from public.categories where slug = p_category_slug and active;
  if cat is null then
    raise exception 'Unknown category' using errcode = '22023';
  end if;

  select * into sup from public.suppliers where owner_id = uid for update;

  if sup.id is null then
    insert into public.suppliers (owner_id, business_name, legal_name, category_id, city, province, moq, lead_days, description)
    values (uid, btrim(p_business_name), btrim(p_legal_name), cat, btrim(p_city), btrim(p_province), p_moq, p_lead_days, btrim(p_description))
    returning * into sup;
    insert into public.supplier_status_history (supplier_id, from_status, to_status, actor_id)
    values (sup.id, null, 'pending', uid);
    perform private.audit('supplier.apply', 'suppliers', sup.id::text);
    return sup.id;
  end if;

  if sup.status not in ('pending', 'rejected') then
    raise exception 'Your application is %; contact TULAY support to change it', sup.status using errcode = '42501';
  end if;

  update public.suppliers set
    business_name = btrim(p_business_name), legal_name = btrim(p_legal_name), category_id = cat,
    city = btrim(p_city), province = btrim(p_province), moq = p_moq, lead_days = p_lead_days,
    description = btrim(p_description), status = 'pending', submitted_at = now()
  where id = sup.id;
  if sup.status <> 'pending' then
    insert into public.supplier_status_history (supplier_id, from_status, to_status, actor_id)
    values (sup.id, sup.status, 'pending', uid);
  end if;
  perform private.audit('supplier.resubmit', 'suppliers', sup.id::text, jsonb_build_object('from', sup.status));
  return sup.id;
end $$;

create function public.admin_set_supplier_status(
  p_supplier_id uuid,
  p_status public.supplier_status,
  p_reason text default ''
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  cur public.supplier_status;
  reason text := btrim(coalesce(p_reason, ''));
begin
  if not public.has_admin_role('verifier') then
    raise exception 'Verifier role with MFA required' using errcode = '42501';
  end if;

  select status into cur from public.suppliers where id = p_supplier_id for update;
  if cur is null then
    raise exception 'Supplier not found' using errcode = 'P0002';
  end if;

  if not (
       (cur = 'pending' and p_status in ('under_review', 'verified', 'rejected'))
    or (cur = 'under_review' and p_status in ('verified', 'rejected'))
    or (cur = 'verified' and p_status in ('suspended', 'restricted'))
    or (cur = 'restricted' and p_status in ('verified', 'suspended'))
    or (cur = 'suspended' and p_status = 'verified')
  ) then
    raise exception 'Cannot move a supplier from % to %', cur, p_status using errcode = '22023';
  end if;

  if p_status in ('rejected', 'suspended', 'restricted') and char_length(reason) < 3 then
    raise exception 'A reason is required' using errcode = '22023';
  end if;

  update public.suppliers set status = p_status, reviewed_at = now() where id = p_supplier_id;
  insert into public.supplier_status_history (supplier_id, from_status, to_status, reason, actor_id)
  values (p_supplier_id, cur, p_status, reason, auth.uid());
  perform private.audit('supplier.status', 'suppliers', p_supplier_id::text,
    jsonb_build_object('from', cur, 'to', p_status, 'reason', reason));
end $$;

create function public.admin_set_account_status(
  p_user_id uuid,
  p_status public.account_status,
  p_reason text
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  target public.profiles;
  reason text := btrim(coalesce(p_reason, ''));
begin
  if not public.has_admin_role('support') then
    raise exception 'Support role with MFA required' using errcode = '42501';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'You cannot change your own account status' using errcode = '42501';
  end if;
  if char_length(reason) < 3 then
    raise exception 'A reason is required' using errcode = '22023';
  end if;

  select * into target from public.profiles where id = p_user_id for update;
  if target.id is null then
    raise exception 'Account not found' using errcode = 'P0002';
  end if;
  if target.role = 'admin' and not public.has_admin_role('super_admin') then
    raise exception 'Only a super admin can change an admin account' using errcode = '42501';
  end if;

  update public.profiles set status = p_status where id = p_user_id;
  perform private.audit('account.status', 'profiles', p_user_id::text,
    jsonb_build_object('from', target.status, 'to', p_status, 'reason', reason));
end $$;

create function public.admin_grant_role(p_user_id uuid, p_sub_role public.admin_sub_role) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.user_role;
begin
  if not public.has_admin_role('super_admin') then
    raise exception 'Super admin with MFA required' using errcode = '42501';
  end if;
  select role into r from public.profiles where id = p_user_id for update;
  if r is null then
    raise exception 'Account not found' using errcode = 'P0002';
  end if;
  if r = 'supplier' then
    raise exception 'Supplier accounts cannot be admins; use a separate account' using errcode = '22023';
  end if;
  update public.profiles set role = 'admin' where id = p_user_id;
  insert into public.admin_roles (user_id, sub_role, granted_by) values (p_user_id, p_sub_role, auth.uid())
  on conflict do nothing;
  perform private.audit('admin.grant', 'profiles', p_user_id::text, jsonb_build_object('sub_role', p_sub_role));
end $$;

create function public.admin_revoke_role(p_user_id uuid, p_sub_role public.admin_sub_role) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_admin_role('super_admin') then
    raise exception 'Super admin with MFA required' using errcode = '42501';
  end if;
  if p_user_id = auth.uid() and p_sub_role = 'super_admin' then
    raise exception 'You cannot remove your own super admin role' using errcode = '42501';
  end if;
  delete from public.admin_roles where user_id = p_user_id and sub_role = p_sub_role;
  perform private.audit('admin.revoke', 'profiles', p_user_id::text, jsonb_build_object('sub_role', p_sub_role));
end $$;

create function public.admin_update_setting(p_key text, p_value jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare old jsonb;
begin
  if not public.has_admin_role('super_admin') then
    raise exception 'Super admin with MFA required' using errcode = '42501';
  end if;
  select value into old from public.platform_settings where key = p_key for update;
  if old is null then
    raise exception 'Unknown setting %', p_key using errcode = 'P0002';
  end if;
  if jsonb_typeof(p_value) is distinct from jsonb_typeof(old) then
    raise exception 'Setting % must be a %', p_key, jsonb_typeof(old) using errcode = '22023';
  end if;
  if jsonb_typeof(p_value) = 'number' and p_value::text !~ '^[0-9]+$' then
    raise exception 'Setting % must be a whole number of 0 or more', p_key using errcode = '22023';
  end if;
  if jsonb_typeof(p_value) = 'string' and char_length(p_value #>> '{}') > 200 then
    raise exception 'Setting % is too long', p_key using errcode = '22023';
  end if;

  update public.platform_settings set value = p_value, updated_at = now(), updated_by = auth.uid() where key = p_key;
  perform private.audit('setting.update', 'platform_settings', p_key, jsonb_build_object('from', old, 'to', p_value));
end $$;

-- Future steps only: a rate already in force is never changed retroactively.
create function public.admin_add_commission_schedule(
  p_rate_bps integer,
  p_starts_at timestamptz,
  p_category_id uuid default null,
  p_note text default ''
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare new_id uuid;
begin
  if not public.has_admin_role('finance') then
    raise exception 'Finance role with MFA required' using errcode = '42501';
  end if;
  if p_starts_at <= now() then
    raise exception 'A commission step must start in the future' using errcode = '22023';
  end if;
  insert into public.commission_schedules (category_id, rate_bps, starts_at, note, created_by)
  values (p_category_id, p_rate_bps, p_starts_at, btrim(coalesce(p_note, '')), auth.uid())
  returning id into new_id;
  perform private.audit('commission.schedule', 'commission_schedules', new_id::text,
    jsonb_build_object('rate_bps', p_rate_bps, 'starts_at', p_starts_at, 'category_id', p_category_id));
  return new_id;
end $$;

-- ---------------------------------------------------------------- privileges + RLS

-- Start from nothing, then grant exactly what each role needs. service_role keeps its defaults.
revoke all on public.profiles, public.admin_roles, public.audit_log, public.categories, public.suppliers,
  public.supplier_status_history, public.supplier_documents, public.platform_settings, public.commission_schedules
  from anon, authenticated;

grant select on public.categories, public.platform_settings to anon, authenticated;
grant select (id, business_name, legal_name, category_id, city, province, moq, lead_days, description, status)
  on public.suppliers to anon;
grant select on public.profiles, public.admin_roles, public.audit_log, public.suppliers,
  public.supplier_status_history, public.supplier_documents, public.commission_schedules to authenticated;
grant update (full_name, phone, business_name, industry, city, province, website, about) on public.profiles to authenticated;
grant insert (supplier_id, kind, storage_path, file_name) on public.supplier_documents to authenticated;

alter table public.profiles enable row level security;
alter table public.admin_roles enable row level security;
alter table public.audit_log enable row level security;
alter table public.categories enable row level security;
alter table public.suppliers enable row level security;
alter table public.supplier_status_history enable row level security;
alter table public.supplier_documents enable row level security;
alter table public.platform_settings enable row level security;
alter table public.commission_schedules enable row level security;

create policy "profiles: own row" on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy "profiles: admins read all" on public.profiles for select to authenticated
  using ((select public.is_admin()));
create policy "profiles: edit own while active" on public.profiles for update to authenticated
  using (id = (select auth.uid()) and (select public.is_active_user()))
  with check (id = (select auth.uid()));

create policy "admin_roles: own or super admin" on public.admin_roles for select to authenticated
  using (user_id = (select auth.uid()) or (select public.has_admin_role('super_admin')));

create policy "audit_log: super admin" on public.audit_log for select to authenticated
  using ((select public.has_admin_role('super_admin')));

create policy "categories: public" on public.categories for select to anon, authenticated using (true);
create policy "platform_settings: public" on public.platform_settings for select to anon, authenticated using (true);
create policy "commission_schedules: signed in" on public.commission_schedules for select to authenticated using (true);

create policy "suppliers: verified are public" on public.suppliers for select to anon, authenticated
  using (status = 'verified');
create policy "suppliers: owner" on public.suppliers for select to authenticated
  using (owner_id = (select auth.uid()));
create policy "suppliers: admins" on public.suppliers for select to authenticated
  using ((select public.is_admin()));

create policy "supplier_status_history: owner or admin" on public.supplier_status_history for select to authenticated
  using (
    (select public.is_admin())
    or exists (select 1 from public.suppliers s where s.id = supplier_id and s.owner_id = (select auth.uid()))
  );

create policy "supplier_documents: owner or verifier reads" on public.supplier_documents for select to authenticated
  using (
    (select public.has_admin_role('verifier'))
    or exists (select 1 from public.suppliers s where s.id = supplier_id and s.owner_id = (select auth.uid()))
  );
create policy "supplier_documents: owner adds" on public.supplier_documents for insert to authenticated
  with check (
    (select public.is_active_user())
    and exists (select 1 from public.suppliers s where s.id = supplier_id and s.owner_id = (select auth.uid()))
  );

-- Functions: helpers for RLS are callable by signed-in users; actions check the caller themselves.
revoke execute on all functions in schema private from public, anon, authenticated;
revoke execute on function
  public.is_active_user(), public.has_admin_role(public.admin_sub_role[]), public.is_admin(),
  public.commission_rate_bps(uuid, timestamptz),
  public.submit_supplier_application(text, text, text, text, text, integer, integer, text),
  public.admin_set_supplier_status(uuid, public.supplier_status, text),
  public.admin_set_account_status(uuid, public.account_status, text),
  public.admin_grant_role(uuid, public.admin_sub_role),
  public.admin_revoke_role(uuid, public.admin_sub_role),
  public.admin_update_setting(text, jsonb),
  public.admin_add_commission_schedule(integer, timestamptz, uuid, text)
  from public, anon;
grant execute on function
  public.is_active_user(), public.has_admin_role(public.admin_sub_role[]), public.is_admin(),
  public.commission_rate_bps(uuid, timestamptz),
  public.submit_supplier_application(text, text, text, text, text, integer, integer, text),
  public.admin_set_supplier_status(uuid, public.supplier_status, text),
  public.admin_set_account_status(uuid, public.account_status, text),
  public.admin_grant_role(uuid, public.admin_sub_role),
  public.admin_revoke_role(uuid, public.admin_sub_role),
  public.admin_update_setting(text, jsonb),
  public.admin_add_commission_schedule(integer, timestamptz, uuid, text)
  to authenticated;

-- ---------------------------------------------------------------- storage: supplier documents

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('supplier-documents', 'supplier-documents', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png']);

-- Upload only into your own supplier folder. No update/delete policy: files can't be overwritten or removed.
create policy "supplier-documents: owner uploads" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'supplier-documents'
    and (select public.is_active_user())
    and exists (
      select 1 from public.suppliers s
      where s.id::text = (storage.foldername(name))[1] and s.owner_id = (select auth.uid())
    )
  );
create policy "supplier-documents: owner or verifier reads" on storage.objects for select to authenticated
  using (
    bucket_id = 'supplier-documents'
    and (
      (select public.has_admin_role('verifier'))
      or exists (
        select 1 from public.suppliers s
        where s.id::text = (storage.foldername(name))[1] and s.owner_id = (select auth.uid())
      )
    )
  );
