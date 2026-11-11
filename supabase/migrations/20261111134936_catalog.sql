-- Stage 2 Discovery: catalog.
-- 12-category tree, supplier listing fields, products with price tiers and media, product review
-- workflow, and one account that can both buy and sell (owner's decision, 2026-11-11).
--
-- Access model (same as Stage 1): RLS on every table; state changes go through the security-definer
-- functions below, which check the caller and write history + audit rows. A product is public only
-- when it is approved AND its supplier is verified.

-- ---------------------------------------------------------------- categories: 12 top-level groups

-- Existing rows are updated in place (suppliers and commission schedules point at their ids).
insert into public.categories (slug, name, parent_id, sort_order)
select v.slug, v.name, null, v.ord
from (values
  ('agriculture-food', 'Agriculture & food', 1),
  ('construction', 'Construction & building materials', 2),
  ('industrial-equipment', 'Industrial equipment', 3),
  ('electronics', 'Electronics & technology', 4),
  ('packaging', 'Packaging & printing', 5),
  ('office-school', 'Office & school supplies', 6),
  ('furniture-home', 'Furniture & home', 7),
  ('clothing-textiles', 'Clothing & textiles', 8),
  ('beauty-personal-care', 'Beauty & personal care', 9),
  ('logistics-transport', 'Logistics & transport', 10),
  ('business-services', 'Business & professional services', 11),
  ('raw-materials', 'Raw materials', 12)
) as v (slug, name, ord)
on conflict (slug) do update set name = excluded.name, parent_id = null, sort_order = excluded.sort_order;

insert into public.categories (slug, name, parent_id, sort_order)
select v.slug, v.name, (select id from public.categories where slug = v.parent), v.ord
from (values
  ('fresh-produce', 'Fresh produce', 'agriculture-food', 1),
  ('coffee-beverages', 'Coffee & beverages', 'agriculture-food', 2),
  ('processed-food', 'Processed food', 'agriculture-food', 3),
  ('cement-aggregates', 'Cement & aggregates', 'construction', 1),
  ('lumber-plywood', 'Lumber & plywood', 'construction', 2),
  ('hardware-tools', 'Hardware & tools', 'construction', 3),
  ('food-machinery', 'Food & beverage machinery', 'industrial-equipment', 1),
  ('printing-machinery', 'Printing machinery', 'industrial-equipment', 2),
  ('computers-it', 'Computers & IT', 'electronics', 1),
  ('pos-systems', 'POS & retail tech', 'electronics', 2),
  ('dtf-prints', 'DTF prints', 'packaging', 1),
  ('sublimation', 'Sublimation', 'packaging', 2),
  ('customized-mugs', 'Customized mugs', 'packaging', 3),
  ('customized-ids', 'Customized IDs', 'packaging', 4),
  ('pouches', 'Pouches & flexible packaging', 'packaging', 5),
  ('boxes', 'Boxes & cartons', 'packaging', 6),
  ('bottles', 'Bottles & jars', 'packaging', 7),
  ('labels', 'Labels & stickers', 'packaging', 8),
  ('food-containers', 'Cups & food containers', 'packaging', 9),
  ('paper-bags', 'Paper bags', 'packaging', 10),
  ('mailers', 'Mailer packaging', 'packaging', 11),
  ('other', 'Other packaging', 'packaging', 12),
  ('paper-products', 'Paper products', 'office-school', 1),
  ('office-furniture', 'Office furniture', 'office-school', 2),
  ('home-furniture', 'Home furniture', 'furniture-home', 1),
  ('kitchenware', 'Kitchenware', 'furniture-home', 2),
  ('custom-shirts', 'Custom shirts', 'clothing-textiles', 1),
  ('uniforms', 'Uniforms & workwear', 'clothing-textiles', 2),
  ('fabrics', 'Fabrics', 'clothing-textiles', 3),
  ('cosmetics', 'Cosmetics', 'beauty-personal-care', 1),
  ('toiletries', 'Toiletries & hotel amenities', 'beauty-personal-care', 2),
  ('trucking', 'Trucking & freight', 'logistics-transport', 1),
  ('warehousing', 'Warehousing', 'logistics-transport', 2),
  ('design-branding', 'Design & branding', 'business-services', 1),
  ('accounting-legal', 'Accounting & legal', 'business-services', 2),
  ('plastics-resin', 'Plastics & resin', 'raw-materials', 1),
  ('paper-pulp', 'Paper & pulp', 'raw-materials', 2)
) as v (slug, name, parent, ord)
on conflict (slug) do update set name = excluded.name, parent_id = excluded.parent_id, sort_order = excluded.sort_order;

create function private.category_id(p_slug text) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare cat uuid;
begin
  select id into cat from public.categories where slug = p_slug and active;
  if cat is null then
    raise exception 'Unknown category' using errcode = '22023';
  end if;
  return cat;
end $$;

-- ---------------------------------------------------------------- suppliers: listing details

create type public.business_type as enum ('manufacturer', 'supplier', 'wholesaler', 'distributor', 'service_provider');

alter table public.suppliers
  add column business_type public.business_type not null default 'supplier',
  add column years_operating integer check (years_operating between 0 and 200), -- self-reported, never shown as verified
  add column delivery_areas text[] not null default '{}' check (cardinality(delivery_areas) <= 30),
  add column keywords text not null default '' check (char_length(keywords) <= 300),
  add column max_quantity integer check (max_quantity between 1 and 10000000);

grant select (business_type, years_operating, delivery_areas, keywords, max_quantity) on public.suppliers to anon;

-- Listing details are self-service; the reviewed application fields stay locked behind
-- submit_supplier_application and admin_set_supplier_status.
grant update (business_type, years_operating, delivery_areas, keywords, max_quantity) on public.suppliers to authenticated;
create policy "suppliers: owner edits listing details" on public.suppliers for update to authenticated
  using (owner_id = (select auth.uid()) and (select public.is_active_user()))
  with check (owner_id = (select auth.uid()));

-- ---------------------------------------------------------------- one account buys and sells

-- role 'supplier' now means "can sell and buy"; a buyer who applies becomes a supplier.
-- Admins stay separate accounts.
create or replace function public.submit_supplier_application(
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
  cat uuid := private.category_id(p_category_slug);
  sup public.suppliers;
begin
  if (select role from public.profiles where id = uid) = 'admin' then
    raise exception 'Admin accounts cannot sell; use a separate account' using errcode = '42501';
  end if;

  select * into sup from public.suppliers where owner_id = uid for update;

  if sup.id is null then
    insert into public.suppliers (owner_id, business_name, legal_name, category_id, city, province, moq, lead_days, description)
    values (uid, btrim(p_business_name), btrim(p_legal_name), cat, btrim(p_city), btrim(p_province), p_moq, p_lead_days, btrim(p_description))
    returning * into sup;
    update public.profiles set role = 'supplier' where id = uid and role = 'buyer';
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

-- ---------------------------------------------------------------- products

create type public.product_status as enum ('draft', 'pending', 'approved', 'rejected');
create type public.product_unit as enum ('pcs', 'boxes', 'packs', 'sets', 'kg');
create type public.return_class as enum ('standard', 'custom', 'final_sale');
create type public.listing_type as enum ('product', 'service');

create table public.products (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers (id),
  category_id uuid not null references public.categories (id),
  title text not null check (char_length(title) between 1 and 140),
  description text not null check (char_length(description) between 1 and 1500),
  moq integer not null check (moq between 1 and 10000000),
  unit public.product_unit not null,
  indicative_price_centavos bigint check (indicative_price_centavos > 0), -- null = price on request
  lead_days integer check (lead_days between 1 and 365),
  return_class public.return_class not null,
  listing_type public.listing_type not null default 'product',
  status public.product_status not null default 'draft',
  review_note text not null default '' check (char_length(review_note) <= 500),
  idempotency_key uuid not null,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (supplier_id, idempotency_key)
);
create index products_supplier_idx on public.products (supplier_id);
create index products_public_idx on public.products (status, category_id);
create index products_created_idx on public.products (created_at desc);
create trigger products_touch before update on public.products
  for each row execute function private.touch_updated_at();

-- The indicative price applies from the MOQ; each tier applies from its min_qty (always above the MOQ).
create table public.price_tiers (
  product_id uuid not null references public.products (id),
  min_qty integer not null check (min_qty between 1 and 10000000),
  unit_price_centavos bigint not null check (unit_price_centavos > 0),
  primary key (product_id, min_qty)
);

-- Files live in the public `product-media` bucket at <supplier_id>/<product_id>/<file>.
create table public.product_media (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id),
  storage_path text not null unique check (
    storage_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[A-Za-z0-9._-]{1,200}$'
    and split_part(storage_path, '/', 2) = product_id::text
  ),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index product_media_product_idx on public.product_media (product_id, sort_order);

create table public.product_status_history (
  id bigint generated always as identity primary key,
  product_id uuid not null references public.products (id),
  from_status public.product_status,
  to_status public.product_status not null,
  reason text not null default '',
  actor_id uuid,
  created_at timestamptz not null default now()
);
create index product_status_history_product_idx on public.product_status_history (product_id, created_at);
create trigger product_status_history_append_only before update or delete on public.product_status_history
  for each row execute function private.forbid_change();

-- ---------------------------------------------------------------- product workflow

-- The caller's supplier id; only verified suppliers manage listings.
create function private.require_verified_supplier() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := private.require_user();
  sid uuid;
begin
  select id into sid from public.suppliers where owner_id = uid and status = 'verified';
  if sid is null then
    raise exception 'Only approved suppliers can manage listings' using errcode = '42501';
  end if;
  return sid;
end $$;

-- Replaces a product's tiers. p_tiers: [{"minQty": 500, "unitPriceCentavos": 2500}, ...]
create function private.write_price_tiers(p_product_id uuid, p_moq integer, p_tiers jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare tiers jsonb := coalesce(p_tiers, '[]');
begin
  if jsonb_typeof(tiers) <> 'array' then
    raise exception 'Price tiers must be a list' using errcode = '22023';
  end if;
  if jsonb_array_length(tiers) > 5 then
    raise exception 'At most 5 price tiers' using errcode = '22023';
  end if;
  delete from public.price_tiers where product_id = p_product_id;
  insert into public.price_tiers (product_id, min_qty, unit_price_centavos)
  select p_product_id, (t ->> 'minQty')::integer, (t ->> 'unitPriceCentavos')::bigint
  from jsonb_array_elements(tiers) t;
  if exists (select 1 from public.price_tiers where product_id = p_product_id and min_qty <= p_moq) then
    raise exception 'Each price tier must start above the MOQ' using errcode = '22023';
  end if;
end $$;

-- Creates a draft. Retrying with the same idempotency key returns the first product unchanged.
create function public.create_product(
  p_idempotency_key uuid,
  p_category_slug text,
  p_title text,
  p_description text,
  p_moq integer,
  p_unit public.product_unit,
  p_indicative_price_centavos bigint,
  p_lead_days integer,
  p_return_class public.return_class,
  p_listing_type public.listing_type,
  p_price_tiers jsonb default '[]'
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  sid uuid := private.require_verified_supplier();
  cat uuid := private.category_id(p_category_slug);
  new_id uuid;
begin
  if p_idempotency_key is null then
    raise exception 'Idempotency key required' using errcode = '22023';
  end if;

  insert into public.products (supplier_id, category_id, title, description, moq, unit, indicative_price_centavos,
    lead_days, return_class, listing_type, idempotency_key)
  values (sid, cat, btrim(p_title), btrim(p_description), p_moq, p_unit, p_indicative_price_centavos,
    p_lead_days, p_return_class, p_listing_type, p_idempotency_key)
  on conflict (supplier_id, idempotency_key) do nothing
  returning id into new_id;

  if new_id is null then
    select id into new_id from public.products where supplier_id = sid and idempotency_key = p_idempotency_key;
    return new_id;
  end if;

  perform private.write_price_tiers(new_id, p_moq, p_price_tiers);
  insert into public.product_status_history (product_id, from_status, to_status, actor_id)
  values (new_id, null, 'draft', auth.uid());
  perform private.audit('product.create', 'products', new_id::text);
  return new_id;
end $$;

-- Editing an approved listing sends it back to review, so unreviewed text never goes public.
create function public.update_product(
  p_product_id uuid,
  p_category_slug text,
  p_title text,
  p_description text,
  p_moq integer,
  p_unit public.product_unit,
  p_indicative_price_centavos bigint,
  p_lead_days integer,
  p_return_class public.return_class,
  p_listing_type public.listing_type,
  p_price_tiers jsonb default '[]'
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  sid uuid := private.require_verified_supplier();
  cat uuid := private.category_id(p_category_slug);
  cur public.product_status;
begin
  select status into cur from public.products where id = p_product_id and supplier_id = sid for update;
  if cur is null then
    raise exception 'Product not found' using errcode = 'P0002';
  end if;

  update public.products set
    category_id = cat, title = btrim(p_title), description = btrim(p_description), moq = p_moq, unit = p_unit,
    indicative_price_centavos = p_indicative_price_centavos, lead_days = p_lead_days,
    return_class = p_return_class, listing_type = p_listing_type,
    status = case when cur = 'approved' then 'pending' else cur end,
    submitted_at = case when cur = 'approved' then now() else submitted_at end
  where id = p_product_id;
  perform private.write_price_tiers(p_product_id, p_moq, p_price_tiers);

  if cur = 'approved' then
    insert into public.product_status_history (product_id, from_status, to_status, reason, actor_id)
    values (p_product_id, 'approved', 'pending', 'Edited by supplier', auth.uid());
  end if;
  perform private.audit('product.update', 'products', p_product_id::text, jsonb_build_object('from', cur));
end $$;

-- Draft or rejected -> pending. Submitting an already pending product changes nothing.
create function public.submit_product(p_product_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  sid uuid := private.require_verified_supplier();
  cur public.product_status;
begin
  select status into cur from public.products where id = p_product_id and supplier_id = sid for update;
  if cur is null then
    raise exception 'Product not found' using errcode = 'P0002';
  end if;
  if cur = 'pending' then
    return;
  end if;
  if cur = 'approved' then
    raise exception 'This product is already approved' using errcode = '22023';
  end if;

  update public.products set status = 'pending', submitted_at = now() where id = p_product_id;
  insert into public.product_status_history (product_id, from_status, to_status, actor_id)
  values (p_product_id, cur, 'pending', auth.uid());
  perform private.audit('product.submit', 'products', p_product_id::text, jsonb_build_object('from', cur));
end $$;

-- Pending -> approved or rejected; approved -> rejected takes a listing down. Rejecting needs a reason.
create function public.admin_review_product(
  p_product_id uuid,
  p_status public.product_status,
  p_reason text default ''
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  cur public.product_status;
  reason text := btrim(coalesce(p_reason, ''));
begin
  if not public.has_admin_role('verifier') then
    raise exception 'Verifier role with MFA required' using errcode = '42501';
  end if;

  select status into cur from public.products where id = p_product_id for update;
  if cur is null then
    raise exception 'Product not found' using errcode = 'P0002';
  end if;
  if not ((cur = 'pending' and p_status in ('approved', 'rejected')) or (cur = 'approved' and p_status = 'rejected')) then
    raise exception 'Cannot move a product from % to %', cur, p_status using errcode = '22023';
  end if;
  if p_status = 'rejected' and char_length(reason) < 3 then
    raise exception 'A reason is required' using errcode = '22023';
  end if;
  if char_length(reason) > 500 then
    raise exception 'Reason is too long' using errcode = '22023';
  end if;

  update public.products set status = p_status, review_note = reason, reviewed_at = now() where id = p_product_id;
  insert into public.product_status_history (product_id, from_status, to_status, reason, actor_id)
  values (p_product_id, cur, p_status, reason, auth.uid());
  perform private.audit('product.review', 'products', p_product_id::text,
    jsonb_build_object('from', cur, 'to', p_status, 'reason', reason));
end $$;

-- ---------------------------------------------------------------- privileges + RLS

revoke all on public.products, public.price_tiers, public.product_media, public.product_status_history
  from anon, authenticated;
grant select on public.products, public.price_tiers, public.product_media to anon, authenticated;
grant select on public.product_status_history to authenticated;
grant insert (product_id, storage_path, sort_order), delete on public.product_media to authenticated;

alter table public.products enable row level security;
alter table public.price_tiers enable row level security;
alter table public.product_media enable row level security;
alter table public.product_status_history enable row level security;

create policy "products: approved from verified suppliers are public" on public.products for select to anon, authenticated
  using (
    status = 'approved'
    and exists (select 1 from public.suppliers s where s.id = supplier_id and s.status = 'verified')
  );
create policy "products: owner" on public.products for select to authenticated
  using (exists (select 1 from public.suppliers s where s.id = supplier_id and s.owner_id = (select auth.uid())));
create policy "products: admins" on public.products for select to authenticated
  using ((select public.is_admin()));

-- Tiers and media follow their product: the subquery is itself filtered by the products policies.
create policy "price_tiers: with visible product" on public.price_tiers for select to anon, authenticated
  using (exists (select 1 from public.products p where p.id = product_id));
create policy "product_media: with visible product" on public.product_media for select to anon, authenticated
  using (exists (select 1 from public.products p where p.id = product_id));

-- New images only on listings not yet live (an approved listing is edited first, which re-opens review).
create policy "product_media: owner adds before approval" on public.product_media for insert to authenticated
  with check (
    (select public.is_active_user())
    and exists (
      select 1 from public.products p join public.suppliers s on s.id = p.supplier_id
      where p.id = product_id and p.status <> 'approved'
        and s.owner_id = (select auth.uid()) and s.status = 'verified'
        and split_part(storage_path, '/', 1) = s.id::text
    )
  );
create policy "product_media: owner removes" on public.product_media for delete to authenticated
  using (
    (select public.is_active_user())
    and exists (
      select 1 from public.products p join public.suppliers s on s.id = p.supplier_id
      where p.id = product_id and s.owner_id = (select auth.uid())
    )
  );

create policy "product_status_history: owner or admin" on public.product_status_history for select to authenticated
  using (
    (select public.is_admin())
    or exists (
      select 1 from public.products p join public.suppliers s on s.id = p.supplier_id
      where p.id = product_id and s.owner_id = (select auth.uid())
    )
  );

revoke execute on all functions in schema private from public, anon, authenticated;
revoke execute on function
  public.create_product(uuid, text, text, text, integer, public.product_unit, bigint, integer, public.return_class, public.listing_type, jsonb),
  public.update_product(uuid, text, text, text, integer, public.product_unit, bigint, integer, public.return_class, public.listing_type, jsonb),
  public.submit_product(uuid),
  public.admin_review_product(uuid, public.product_status, text)
  from public, anon;
grant execute on function
  public.create_product(uuid, text, text, text, integer, public.product_unit, bigint, integer, public.return_class, public.listing_type, jsonb),
  public.update_product(uuid, text, text, text, integer, public.product_unit, bigint, integer, public.return_class, public.listing_type, jsonb),
  public.submit_product(uuid),
  public.admin_review_product(uuid, public.product_status, text)
  to authenticated;

-- ---------------------------------------------------------------- storage: product media (public bucket)

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-media', 'product-media', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']);

-- Upload only into <your supplier id>/<your product id>/. The bucket is public, so reads need no policy;
-- the select policy below lets owners list and delete their own files.
create policy "product-media: owner uploads" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'product-media'
    and (select public.is_active_user())
    and exists (
      select 1 from public.products p join public.suppliers s on s.id = p.supplier_id
      where s.id::text = (storage.foldername(name))[1] and p.id::text = (storage.foldername(name))[2]
        and s.owner_id = (select auth.uid()) and s.status = 'verified'
    )
  );
create policy "product-media: owner reads" on storage.objects for select to authenticated
  using (
    bucket_id = 'product-media'
    and exists (
      select 1 from public.suppliers s
      where s.id::text = (storage.foldername(name))[1] and s.owner_id = (select auth.uid())
    )
  );
create policy "product-media: owner deletes" on storage.objects for delete to authenticated
  using (
    bucket_id = 'product-media'
    and (select public.is_active_user())
    and exists (
      select 1 from public.suppliers s
      where s.id::text = (storage.foldername(name))[1] and s.owner_id = (select auth.uid())
    )
  );
