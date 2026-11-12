-- Stage 3 Deals: requests for quotation (RFQs), supplier invites, quotes, negotiation (offers),
-- the buyer's supplier selection, per-supplier message threads and in-app notifications.
-- No money moves here: a selection only records the agreed deal.
--
-- Flow:  draft -> under_review -> (needs_information -> under_review) | matching -> invited -> quoting
--        -> supplier_selected;  any open state -> cancelled.
-- Admin moderation uses the `support` sub-role. Buyers stay anonymous to suppliers until selected.

-- ---------------------------------------------------------------- settings

insert into public.platform_settings (key, value, description) values
  ('rfq_max_invites', '10', 'Most suppliers one RFQ can be sent to.'),
  ('rfq_auto_invite_max', '5', 'On approval, invite up to this many best-matching suppliers who opted in to auto-invites (0 = off).');

-- Suppliers opt in to being invited automatically to matching RFQs.
alter table public.suppliers add column auto_invites boolean not null default false;
grant select (auto_invites) on public.suppliers to anon;
grant update (auto_invites) on public.suppliers to authenticated;

create function private.setting_int(p_key text) returns integer
language sql stable security definer set search_path = '' as $$
  select (value #>> '{}')::integer from public.platform_settings where key = p_key;
$$;

create function private.manila_today() returns date
language sql stable set search_path = '' as $$
  select (now() at time zone 'Asia/Manila')::date;
$$;

-- ---------------------------------------------------------------- types

create type public.rfq_status as enum
  ('draft', 'under_review', 'needs_information', 'matching', 'invited', 'quoting', 'supplier_selected', 'cancelled');
create type public.delivery_terms as enum ('supplier_delivery', 'buyer_pickup', 'third_party_freight');
create type public.delivery_preference as enum ('supplier_delivery', 'buyer_pickup', 'third_party_freight', 'any');
create type public.bir_invoice as enum ('vat', 'non_vat', 'none');
create type public.invite_status as enum ('invited', 'accepted', 'declined');
create type public.offer_action as enum ('counter', 'accept', 'decline');

-- ---------------------------------------------------------------- tables

create sequence public.rfq_ref_seq;
create sequence public.quote_ref_seq;
create sequence public.selection_ref_seq;

-- Drafts may be incomplete; save_rfq checks every field before a submit.
create table public.rfqs (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique
    default 'RFQ-' || to_char(now() at time zone 'Asia/Manila', 'YYYY') || '-' || lpad(nextval('public.rfq_ref_seq')::text, 4, '0'),
  buyer_id uuid not null references public.profiles (id),
  product text not null check (char_length(product) between 1 and 160),
  category_id uuid references public.categories (id),
  description text not null default '' check (char_length(description) <= 2500),
  specs text not null default '' check (char_length(specs) <= 1800),
  quantity integer check (quantity between 1 and 10000000),
  unit public.product_unit not null default 'pcs',
  city text not null default '' check (char_length(city) <= 100),
  province text not null default '' check (char_length(province) <= 100),
  required_by date,
  budget_centavos bigint check (budget_centavos > 0),
  sharing_consent boolean not null default false,
  delivery_preference public.delivery_preference not null default 'any',
  needs_bir_invoice boolean not null default false,
  status public.rfq_status not null default 'draft',
  review_note text not null default '' check (char_length(review_note) <= 500),
  idempotency_key uuid not null,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (buyer_id, idempotency_key)
);
create index rfqs_buyer_idx on public.rfqs (buyer_id, created_at desc);
create index rfqs_status_idx on public.rfqs (status, submitted_at);
create trigger rfqs_touch before update on public.rfqs
  for each row execute function private.touch_updated_at();

create table public.rfq_status_history (
  id bigint generated always as identity primary key,
  rfq_id uuid not null references public.rfqs (id),
  from_status public.rfq_status,
  to_status public.rfq_status not null,
  reason text not null default '',
  actor_id uuid,
  created_at timestamptz not null default now()
);
create index rfq_status_history_rfq_idx on public.rfq_status_history (rfq_id, created_at);

create table public.rfq_invites (
  rfq_id uuid not null references public.rfqs (id),
  supplier_id uuid not null references public.suppliers (id),
  status public.invite_status not null default 'invited',
  auto boolean not null default false, -- true = sent by auto-invite on approval
  invited_by uuid,
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  primary key (rfq_id, supplier_id)
);
create index rfq_invites_supplier_idx on public.rfq_invites (supplier_id, created_at desc);

-- Each revision is a new row. price_tiers: [{"minQty": n, "unitPriceCentavos": c}], ascending, all above quantity.
create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique default 'QT-' || lpad(nextval('public.quote_ref_seq')::text, 5, '0'),
  rfq_id uuid not null references public.rfqs (id),
  supplier_id uuid not null references public.suppliers (id),
  revision integer not null check (revision >= 1),
  quantity integer not null check (quantity between 1 and 10000000),
  unit_price_centavos bigint not null check (unit_price_centavos > 0),
  setup_fee_centavos bigint check (setup_fee_centavos >= 0),      -- null = not provided (not zero)
  shipping_fee_centavos bigint check (shipping_fee_centavos >= 0),
  tax_centavos bigint check (tax_centavos >= 0),
  lead_days integer not null check (lead_days between 1 and 365),
  valid_until date not null,
  payment_terms text not null check (char_length(payment_terms) between 1 and 300),
  notes text not null default '' check (char_length(notes) <= 1200),
  delivery_terms public.delivery_terms not null,
  bir_invoice public.bir_invoice not null,
  price_tiers jsonb not null default '[]' check (jsonb_typeof(price_tiers) = 'array'),
  idempotency_key uuid not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (rfq_id, supplier_id, revision),
  unique (supplier_id, idempotency_key)
);

-- Negotiation on a supplier's latest quote. accept / decline answer the other party's open counter
-- and copy its terms, so every row stands on its own.
create table public.offers (
  seq bigint generated always as identity unique, -- creation order; created_at ties inside one transaction
  id uuid primary key default gen_random_uuid(),
  rfq_id uuid not null references public.rfqs (id),
  supplier_id uuid not null references public.suppliers (id),
  quote_id uuid not null references public.quotes (id),
  actor_id uuid not null,
  action public.offer_action not null,
  quantity integer not null check (quantity between 1 and 10000000),
  unit_price_centavos bigint not null check (unit_price_centavos > 0),
  lead_days integer not null check (lead_days between 1 and 365),
  payment_terms text not null check (char_length(payment_terms) between 1 and 300),
  message text not null default '' check (char_length(message) <= 1000),
  related_offer_id uuid references public.offers (id),
  idempotency_key uuid not null,
  created_at timestamptz not null default now(),
  unique (actor_id, idempotency_key)
);
create index offers_thread_idx on public.offers (rfq_id, supplier_id, seq);

create table public.selections (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique
    default 'SEL-' || to_char(now() at time zone 'Asia/Manila', 'YYYY') || '-' || lpad(nextval('public.selection_ref_seq')::text, 4, '0'),
  rfq_id uuid not null unique references public.rfqs (id),
  buyer_id uuid not null references public.profiles (id),
  supplier_id uuid not null references public.suppliers (id),
  quote_id uuid not null references public.quotes (id),
  offer_id uuid references public.offers (id),
  amount_centavos bigint not null check (amount_centavos > 0),
  amount_is_estimate boolean not null, -- true when the supplier left a fee blank
  created_at timestamptz not null default now()
);

create table public.rfq_messages (
  id bigint generated always as identity primary key,
  rfq_id uuid not null references public.rfqs (id),
  supplier_id uuid not null references public.suppliers (id),
  sender_id uuid not null,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index rfq_messages_thread_idx on public.rfq_messages (rfq_id, supplier_id, created_at);

create table public.notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) <= 120),
  body text not null check (char_length(body) <= 500),
  link text not null default '' check (link = '' or link ~ '^/'),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

create trigger rfq_status_history_append_only before update or delete on public.rfq_status_history
  for each row execute function private.forbid_change();
create trigger quotes_append_only before update or delete on public.quotes
  for each row execute function private.forbid_change();
create trigger offers_append_only before update or delete on public.offers
  for each row execute function private.forbid_change();
create trigger selections_append_only before update or delete on public.selections
  for each row execute function private.forbid_change();
create trigger rfq_messages_append_only before update or delete on public.rfq_messages
  for each row execute function private.forbid_change();

-- ---------------------------------------------------------------- access helpers (used by RLS)

-- Security definer so RLS policies can ask without the tables' own policies looping into each other.
create function public.my_supplier_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.suppliers where owner_id = auth.uid();
$$;

create function public.is_rfq_buyer(p_rfq_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.rfqs where id = p_rfq_id and buyer_id = auth.uid());
$$;

-- ---------------------------------------------------------------- internal helpers

create function private.notify(p_user_id uuid, p_title text, p_body text, p_link text default '') returns void
language sql security definer set search_path = '' as $$
  insert into public.notifications (user_id, title, body, link) values (p_user_id, left(p_title, 120), left(p_body, 500), p_link);
$$;

create function private.notify_support(p_title text, p_body text, p_link text) returns void
language sql security definer set search_path = '' as $$
  insert into public.notifications (user_id, title, body, link)
  select distinct p.id, left(p_title, 120), left(p_body, 500), p_link
  from public.profiles p join public.admin_roles ar on ar.user_id = p.id
  where p.role = 'admin' and p.status = 'active' and ar.sub_role in ('support', 'super_admin');
$$;

create function private.set_rfq_status(p_rfq_id uuid, p_from public.rfq_status, p_to public.rfq_status, p_reason text default '') returns void
language sql security definer set search_path = '' as $$
  update public.rfqs set status = p_to where id = p_rfq_id;
  insert into public.rfq_status_history (rfq_id, from_status, to_status, reason, actor_id)
  values (p_rfq_id, p_from, p_to, coalesce(p_reason, ''), auth.uid());
$$;

-- Checks and sorts quote tiers: whole numbers, positive prices, each minQty above p_above, at most 5, no repeats.
create function private.clean_tiers(p_tiers jsonb, p_above integer) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare
  t jsonb := coalesce(p_tiers, '[]');
  out jsonb;
begin
  if jsonb_typeof(t) <> 'array' then
    raise exception 'Price tiers must be a list' using errcode = '22023';
  end if;
  if jsonb_array_length(t) > 5 then
    raise exception 'At most 5 price tiers' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(t) e
    where jsonb_typeof(e -> 'minQty') <> 'number' or jsonb_typeof(e -> 'unitPriceCentavos') <> 'number'
       or (e ->> 'minQty') !~ '^[0-9]+$' or (e ->> 'unitPriceCentavos') !~ '^[0-9]+$'
       or (e ->> 'minQty')::bigint <= p_above or (e ->> 'minQty')::bigint > 10000000
       or (e ->> 'unitPriceCentavos')::bigint <= 0
  ) then
    raise exception 'Each price tier needs a whole minimum quantity above % and a positive price in centavos', p_above using errcode = '22023';
  end if;
  if (select count(distinct e ->> 'minQty') from jsonb_array_elements(t) e) <> jsonb_array_length(t) then
    raise exception 'Each tier needs a different minimum quantity' using errcode = '22023';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('minQty', (e ->> 'minQty')::integer, 'unitPriceCentavos', (e ->> 'unitPriceCentavos')::bigint)
           order by (e ->> 'minQty')::integer), '[]')
  into out from jsonb_array_elements(t) e;
  return out;
end $$;

create function private.latest_quote(p_rfq_id uuid, p_supplier_id uuid) returns public.quotes
language sql stable security definer set search_path = '' as $$
  select * from public.quotes where rfq_id = p_rfq_id and supplier_id = p_supplier_id order by revision desc limit 1;
$$;

-- Ranked verified suppliers for an RFQ: same category 3, same top-level group 2; delivers to the province
-- (or "Nationwide") +2; keywords overlap +1. Excludes the buyer's own supplier and suppliers whose
-- max quantity is below the request. Only rows with a category match are returned.
create function private.rank_suppliers(p_rfq_id uuid) returns table (supplier_id uuid, score integer)
language sql stable security definer set search_path = '' as $$
  with r as (
    select r.*, c.parent_id as cat_parent from public.rfqs r left join public.categories c on c.id = r.category_id
    where r.id = p_rfq_id
  )
  select s.id,
    (case when s.category_id = r.category_id then 3
          when coalesce(sc.parent_id, sc.id) = coalesce(r.cat_parent, r.category_id) then 2 else 0 end
     + case when exists (select 1 from unnest(s.delivery_areas) a where lower(a) in (lower(r.province), 'nationwide')) then 2 else 0 end
     + case when s.keywords <> '' and to_tsvector('english', s.keywords) @@ plainto_tsquery('english', r.product || ' ' || r.specs) then 1 else 0 end
    )::integer
  from r
  join public.suppliers s on s.status = 'verified' and s.owner_id <> r.buyer_id
  join public.categories sc on sc.id = s.category_id
  where (s.max_quantity is null or r.quantity is null or s.max_quantity >= r.quantity)
    and (s.category_id = r.category_id or coalesce(sc.parent_id, sc.id) = coalesce(r.cat_parent, r.category_id))
  order by 2 desc, s.business_name;
$$;

create function private.invite(p_rfq_id uuid, p_supplier_id uuid, p_auto boolean) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  r public.rfqs;
  owner uuid;
begin
  select * into r from public.rfqs where id = p_rfq_id;
  select owner_id into owner from public.suppliers where id = p_supplier_id and status = 'verified';
  if owner is null then
    raise exception 'Only approved suppliers can be invited' using errcode = '22023';
  end if;
  if owner = r.buyer_id then
    raise exception 'A buyer''s own supplier account cannot quote on their request' using errcode = '22023';
  end if;
  insert into public.rfq_invites (rfq_id, supplier_id, auto, invited_by) values (p_rfq_id, p_supplier_id, p_auto, auth.uid())
  on conflict do nothing;
  if not found then
    return false;
  end if;
  perform private.notify(owner, 'New RFQ invitation', 'You were invited to quote on ' || r.ref || ': ' || r.product || '.',
    '/supplier/rfqs/' || p_rfq_id);
  return true;
end $$;

-- ---------------------------------------------------------------- buyer: requests

-- Creates (p_rfq_id null; idempotent by key) or edits a draft / needs-information request.
-- p_submit = true checks every field and sends it to TULAY review.
create function public.save_rfq(
  p_rfq_id uuid,
  p_idempotency_key uuid,
  p_product text,
  p_category_slug text,
  p_description text,
  p_specs text,
  p_quantity integer,
  p_unit public.product_unit,
  p_city text,
  p_province text,
  p_required_by date,
  p_budget_centavos bigint,
  p_sharing_consent boolean,
  p_delivery_preference public.delivery_preference,
  p_needs_bir_invoice boolean,
  p_submit boolean
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_user();
  cat uuid;
  r public.rfqs;
  daily integer;
begin
  if (select role from public.profiles where id = uid) = 'admin' then
    raise exception 'Admin accounts cannot post requests' using errcode = '42501';
  end if;
  if btrim(coalesce(p_product, '')) = '' then
    raise exception 'Name the product you need' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_category_slug, '')), '') is not null then
    cat := private.category_id(p_category_slug);
  end if;

  if p_rfq_id is null then
    if p_idempotency_key is null then
      raise exception 'Idempotency key required' using errcode = '22023';
    end if;
    insert into public.rfqs (buyer_id, idempotency_key, product) values (uid, p_idempotency_key, btrim(coalesce(p_product, '')))
    on conflict (buyer_id, idempotency_key) do nothing
    returning * into r;
    if r.id is null then
      -- Same key again: a retry of a create that already happened.
      return (select id from public.rfqs where buyer_id = uid and idempotency_key = p_idempotency_key);
    end if;
    insert into public.rfq_status_history (rfq_id, from_status, to_status, actor_id) values (r.id, null, 'draft', uid);
  else
    select * into r from public.rfqs where id = p_rfq_id and buyer_id = uid for update;
    if r.id is null then
      raise exception 'Request not found' using errcode = 'P0002';
    end if;
    if r.status not in ('draft', 'needs_information') then
      raise exception 'This request can no longer be edited' using errcode = '22023';
    end if;
  end if;

  update public.rfqs set
    product = btrim(coalesce(p_product, '')), category_id = cat, description = btrim(coalesce(p_description, '')),
    specs = btrim(coalesce(p_specs, '')), quantity = p_quantity, unit = coalesce(p_unit, 'pcs'),
    city = btrim(coalesce(p_city, '')), province = btrim(coalesce(p_province, '')), required_by = p_required_by,
    budget_centavos = p_budget_centavos, sharing_consent = coalesce(p_sharing_consent, false),
    delivery_preference = coalesce(p_delivery_preference, 'any'), needs_bir_invoice = coalesce(p_needs_bir_invoice, false)
  where id = r.id
  returning * into r;

  if p_submit then
    if r.category_id is null or r.description = '' or r.specs = '' or r.quantity is null or r.city = '' or r.province = ''
       or r.required_by is null then
      raise exception 'Fill in every required field before submitting' using errcode = '22023';
    end if;
    if r.required_by < private.manila_today() then
      raise exception 'The required-by date is in the past' using errcode = '22023';
    end if;
    if not r.sharing_consent then
      raise exception 'Consent to share the request with suppliers is required' using errcode = '22023';
    end if;
    select count(*) into daily from public.rfqs
    where buyer_id = uid and id <> r.id and submitted_at >= (private.manila_today()::timestamp at time zone 'Asia/Manila');
    if daily >= private.setting_int('rfq_max_per_day') then
      raise exception 'You can submit % requests per day; try again tomorrow', private.setting_int('rfq_max_per_day') using errcode = '22023';
    end if;
    update public.rfqs set submitted_at = now() where id = r.id;
    perform private.set_rfq_status(r.id, r.status, 'under_review');
    perform private.notify_support('RFQ to review', r.ref || ': ' || r.product, '/admin/rfqs/' || r.id);
    perform private.audit('rfq.submit', 'rfqs', r.id::text, jsonb_build_object('from', r.status));
  else
    perform private.audit('rfq.save', 'rfqs', r.id::text);
  end if;
  return r.id;
end $$;

create function public.cancel_rfq(p_rfq_id uuid, p_reason text default '') returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_user();
  cur public.rfq_status;
begin
  select status into cur from public.rfqs where id = p_rfq_id and buyer_id = uid for update;
  if cur is null then
    raise exception 'Request not found' using errcode = 'P0002';
  end if;
  if cur in ('supplier_selected', 'cancelled') then
    raise exception 'This request is already %', replace(cur::text, '_', ' ') using errcode = '22023';
  end if;
  perform private.set_rfq_status(p_rfq_id, cur, 'cancelled', left(btrim(coalesce(p_reason, '')), 500));
  insert into public.notifications (user_id, title, body, link)
  select s.owner_id, 'RFQ cancelled', r.ref || ' was cancelled by the buyer.', '/supplier/rfqs/' || r.id
  from public.rfq_invites i join public.suppliers s on s.id = i.supplier_id join public.rfqs r on r.id = i.rfq_id
  where i.rfq_id = p_rfq_id and i.status <> 'declined';
  perform private.audit('rfq.cancel', 'rfqs', p_rfq_id::text, jsonb_build_object('from', cur));
end $$;

-- ---------------------------------------------------------------- admin: review and invites

-- p_decision: 'approve' (-> matching, then auto-invites), 'needs_information' or 'reject' (-> cancelled). Both need a note.
create function public.admin_review_rfq(p_rfq_id uuid, p_decision text, p_note text default '') returns void
language plpgsql security definer set search_path = '' as $$
declare
  r public.rfqs;
  note text := btrim(coalesce(p_note, ''));
  auto_max integer := coalesce(private.setting_int('rfq_auto_invite_max'), 0);
  invited integer := 0;
  s record;
begin
  if not public.has_admin_role('support') then
    raise exception 'Support role with MFA required' using errcode = '42501';
  end if;
  select * into r from public.rfqs where id = p_rfq_id for update;
  if r.id is null then
    raise exception 'Request not found' using errcode = 'P0002';
  end if;
  if r.status <> 'under_review' then
    raise exception 'Only requests under review can be reviewed' using errcode = '22023';
  end if;
  if p_decision in ('needs_information', 'reject') and char_length(note) < 3 then
    raise exception 'A note for the buyer is required' using errcode = '22023';
  end if;
  if char_length(note) > 500 then
    raise exception 'Note is too long' using errcode = '22023';
  end if;
  update public.rfqs set review_note = note where id = p_rfq_id;

  if p_decision = 'approve' then
    perform private.set_rfq_status(p_rfq_id, 'under_review', 'matching', note);
    for s in
      select k.supplier_id from private.rank_suppliers(p_rfq_id) k
      join public.suppliers x on x.id = k.supplier_id
      where x.auto_invites limit greatest(least(auto_max, private.setting_int('rfq_max_invites')), 0)
    loop
      if private.invite(p_rfq_id, s.supplier_id, true) then
        invited := invited + 1;
      end if;
    end loop;
    if invited > 0 then
      perform private.set_rfq_status(p_rfq_id, 'matching', 'invited', 'Auto-invited ' || invited || ' supplier(s)');
    end if;
    perform private.notify(r.buyer_id, 'RFQ approved', r.ref || ' is approved and is being sent to suppliers.', '/buyer/rfqs/' || r.id);
  elsif p_decision = 'needs_information' then
    perform private.set_rfq_status(p_rfq_id, 'under_review', 'needs_information', note);
    perform private.notify(r.buyer_id, 'More information needed', r.ref || ': ' || note, '/buyer/rfqs/' || r.id);
  elsif p_decision = 'reject' then
    perform private.set_rfq_status(p_rfq_id, 'under_review', 'cancelled', note);
    perform private.notify(r.buyer_id, 'RFQ not approved', r.ref || ': ' || note, '/buyer/rfqs/' || r.id);
  else
    raise exception 'Unknown decision' using errcode = '22023';
  end if;
  perform private.audit('rfq.review', 'rfqs', p_rfq_id::text,
    jsonb_build_object('decision', p_decision, 'note', note, 'auto_invited', invited));
end $$;

-- Matching suppliers for the admin's invite screen, best first.
create function public.admin_suggest_suppliers(p_rfq_id uuid) returns table (supplier_id uuid, score integer)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_admin_role('support') then
    raise exception 'Support role with MFA required' using errcode = '42501';
  end if;
  return query select * from private.rank_suppliers(p_rfq_id);
end $$;

-- Adds invites (already-invited suppliers are skipped). The total per RFQ is capped by rfq_max_invites.
create function public.admin_invite_suppliers(p_rfq_id uuid, p_supplier_ids uuid[]) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  cur public.rfq_status;
  sid uuid;
  added integer := 0;
begin
  if not public.has_admin_role('support') then
    raise exception 'Support role with MFA required' using errcode = '42501';
  end if;
  select status into cur from public.rfqs where id = p_rfq_id for update;
  if cur is null then
    raise exception 'Request not found' using errcode = 'P0002';
  end if;
  if cur not in ('matching', 'invited', 'quoting') then
    raise exception 'Suppliers can be invited only after approval and before a supplier is selected' using errcode = '22023';
  end if;
  if (select count(*) from public.rfq_invites where rfq_id = p_rfq_id)
     + (select count(*) from unnest(p_supplier_ids) x where not exists (
          select 1 from public.rfq_invites i where i.rfq_id = p_rfq_id and i.supplier_id = x))
     > private.setting_int('rfq_max_invites') then
    raise exception 'An RFQ can go to at most % suppliers', private.setting_int('rfq_max_invites') using errcode = '22023';
  end if;
  foreach sid in array coalesce(p_supplier_ids, '{}') loop
    if private.invite(p_rfq_id, sid, false) then
      added := added + 1;
    end if;
  end loop;
  if added > 0 and cur = 'matching' then
    perform private.set_rfq_status(p_rfq_id, 'matching', 'invited');
  end if;
  perform private.audit('rfq.invite', 'rfqs', p_rfq_id::text, jsonb_build_object('suppliers', p_supplier_ids, 'added', added));
  return added;
end $$;

-- ---------------------------------------------------------------- supplier: invites and quotes

create function public.respond_rfq_invite(p_rfq_id uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  sid uuid := private.require_verified_supplier();
  cur public.invite_status;
  r public.rfqs;
begin
  select status into cur from public.rfq_invites where rfq_id = p_rfq_id and supplier_id = sid for update;
  if cur is null then
    raise exception 'Invitation not found' using errcode = 'P0002';
  end if;
  if cur <> 'invited' then
    raise exception 'You already answered this invitation' using errcode = '22023';
  end if;
  select * into r from public.rfqs where id = p_rfq_id;
  if r.status in ('supplier_selected', 'cancelled') then
    raise exception 'This request is closed' using errcode = '22023';
  end if;
  update public.rfq_invites set status = case when p_accept then 'accepted' else 'declined' end::public.invite_status,
    responded_at = now()
  where rfq_id = p_rfq_id and supplier_id = sid;
  perform private.audit(case when p_accept then 'rfq.invite_accept' else 'rfq.invite_decline' end, 'rfqs', p_rfq_id::text,
    jsonb_build_object('supplier_id', sid));
end $$;

-- A new quote or a revision (revision = previous + 1). Retrying with the same key returns the same quote.
create function public.submit_quote(
  p_rfq_id uuid,
  p_idempotency_key uuid,
  p_quantity integer,
  p_unit_price_centavos bigint,
  p_setup_fee_centavos bigint,
  p_shipping_fee_centavos bigint,
  p_tax_centavos bigint,
  p_lead_days integer,
  p_valid_until date,
  p_payment_terms text,
  p_notes text,
  p_delivery_terms public.delivery_terms,
  p_bir_invoice public.bir_invoice,
  p_price_tiers jsonb default '[]'
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  sid uuid := private.require_verified_supplier();
  inv public.invite_status;
  r public.rfqs;
  q_id uuid;
  rev integer;
begin
  if p_idempotency_key is null then
    raise exception 'Idempotency key required' using errcode = '22023';
  end if;
  select id into q_id from public.quotes where supplier_id = sid and idempotency_key = p_idempotency_key;
  if q_id is not null then
    return q_id;
  end if;

  select * into r from public.rfqs where id = p_rfq_id for update;
  select status into inv from public.rfq_invites where rfq_id = p_rfq_id and supplier_id = sid for update;
  if r.id is null or inv is null then
    raise exception 'Invitation not found' using errcode = 'P0002';
  end if;
  if inv = 'declined' then
    raise exception 'You declined this invitation' using errcode = '22023';
  end if;
  if r.status not in ('invited', 'quoting') then
    raise exception 'This request is not accepting quotes' using errcode = '22023';
  end if;
  if p_valid_until is null or p_valid_until < private.manila_today() then
    raise exception 'Valid-until must be today or later' using errcode = '22023';
  end if;

  select coalesce(max(revision), 0) + 1 into rev from public.quotes where rfq_id = p_rfq_id and supplier_id = sid;
  insert into public.quotes (rfq_id, supplier_id, revision, quantity, unit_price_centavos, setup_fee_centavos, shipping_fee_centavos,
    tax_centavos, lead_days, valid_until, payment_terms, notes, delivery_terms, bir_invoice, price_tiers, idempotency_key, created_by)
  values (p_rfq_id, sid, rev, p_quantity, p_unit_price_centavos, p_setup_fee_centavos, p_shipping_fee_centavos,
    p_tax_centavos, p_lead_days, p_valid_until, btrim(coalesce(p_payment_terms, '')), btrim(coalesce(p_notes, '')),
    p_delivery_terms, p_bir_invoice, private.clean_tiers(p_price_tiers, p_quantity), p_idempotency_key, auth.uid())
  returning id into q_id;

  if inv = 'invited' then
    update public.rfq_invites set status = 'accepted', responded_at = now() where rfq_id = p_rfq_id and supplier_id = sid;
  end if;
  if r.status = 'invited' then
    perform private.set_rfq_status(p_rfq_id, 'invited', 'quoting');
  end if;
  perform private.notify(r.buyer_id, case when rev = 1 then 'New quotation' else 'Revised quotation' end,
    (select business_name from public.suppliers where id = sid) || ' sent a quote for ' || r.ref || '.', '/buyer/rfqs/' || r.id);
  perform private.audit('quote.submit', 'quotes', q_id::text, jsonb_build_object('rfq_id', p_rfq_id, 'revision', rev));
  return q_id;
end $$;

-- ---------------------------------------------------------------- both sides: negotiation

-- counter: new terms on the supplier's latest quote (only while that quote is valid).
-- accept / decline: answer the other party's open counter (p_related_offer_id); its terms are copied.
-- An open counter is the newest offer in the thread when it is a counter on the latest quote.
create function public.make_offer(
  p_rfq_id uuid,
  p_supplier_id uuid,
  p_idempotency_key uuid,
  p_action public.offer_action,
  p_related_offer_id uuid,
  p_quantity integer,
  p_unit_price_centavos bigint,
  p_lead_days integer,
  p_payment_terms text,
  p_message text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_user();
  r public.rfqs;
  owner uuid;
  q public.quotes;
  last public.offers;
  open_counter public.offers;
  new_id uuid;
  other uuid;
begin
  if p_idempotency_key is null then
    raise exception 'Idempotency key required' using errcode = '22023';
  end if;
  select id into new_id from public.offers where actor_id = uid and idempotency_key = p_idempotency_key;
  if new_id is not null then
    return new_id;
  end if;

  select * into r from public.rfqs where id = p_rfq_id for update;
  select owner_id into owner from public.suppliers where id = p_supplier_id;
  if r.id is null or owner is null or uid not in (r.buyer_id, owner) then
    raise exception 'Negotiation not found' using errcode = 'P0002';
  end if;
  if uid = owner and not exists (select 1 from public.suppliers where id = p_supplier_id and status = 'verified') then
    raise exception 'Only approved suppliers can negotiate' using errcode = '42501';
  end if;
  if r.status <> 'quoting' then
    raise exception 'This request is not open for negotiation' using errcode = '22023';
  end if;
  q := private.latest_quote(p_rfq_id, p_supplier_id);
  if q.id is null then
    raise exception 'There is no quote to negotiate yet' using errcode = '22023';
  end if;
  if q.valid_until < private.manila_today() then
    raise exception 'This quote has expired; ask the supplier to revise it' using errcode = '22023';
  end if;
  other := case when uid = r.buyer_id then owner else r.buyer_id end;

  select * into last from public.offers where rfq_id = p_rfq_id and supplier_id = p_supplier_id
  order by seq desc limit 1;
  if last.id is not null and last.action = 'counter' and last.quote_id = q.id then
    open_counter := last;
  end if;

  if p_action = 'counter' then
    if open_counter.id is not null and open_counter.actor_id = uid then
      raise exception 'Wait for a reply to your last counteroffer' using errcode = '22023';
    end if;
    if p_quantity is null or p_unit_price_centavos is null or p_lead_days is null or btrim(coalesce(p_payment_terms, '')) = '' then
      raise exception 'A counteroffer needs quantity, unit price, lead time and payment terms' using errcode = '22023';
    end if;
    insert into public.offers (rfq_id, supplier_id, quote_id, actor_id, action, quantity, unit_price_centavos, lead_days,
      payment_terms, message, related_offer_id, idempotency_key)
    values (p_rfq_id, p_supplier_id, q.id, uid, 'counter', p_quantity, p_unit_price_centavos, p_lead_days,
      btrim(p_payment_terms), btrim(coalesce(p_message, '')), open_counter.id, p_idempotency_key)
    returning id into new_id;
  else
    if open_counter.id is null or open_counter.id is distinct from p_related_offer_id or open_counter.actor_id = uid then
      raise exception 'There is no open counteroffer from the other side to answer' using errcode = '22023';
    end if;
    insert into public.offers (rfq_id, supplier_id, quote_id, actor_id, action, quantity, unit_price_centavos, lead_days,
      payment_terms, message, related_offer_id, idempotency_key)
    values (p_rfq_id, p_supplier_id, q.id, uid, p_action, open_counter.quantity, open_counter.unit_price_centavos,
      open_counter.lead_days, open_counter.payment_terms, btrim(coalesce(p_message, '')), open_counter.id, p_idempotency_key)
    returning id into new_id;
  end if;

  perform private.notify(other,
    case p_action when 'counter' then 'Counteroffer received' when 'accept' then 'Counteroffer accepted' else 'Counteroffer declined' end,
    r.ref || ': ' || r.product,
    case when other = r.buyer_id then '/buyer/rfqs/' else '/supplier/rfqs/' end || r.id);
  perform private.audit('offer.' || p_action, 'offers', new_id::text, jsonb_build_object('rfq_id', p_rfq_id, 'supplier_id', p_supplier_id));
  return new_id;
end $$;

-- ---------------------------------------------------------------- buyer: select a supplier

-- Records the deal on the supplier's latest valid quote, or on an accepted counteroffer of it.
-- Amount = unit price (tier for the quantity, or the accepted price) x quantity + every fee provided;
-- flagged as an estimate when a fee was left blank. Selecting again with the same quote is a no-op.
create function public.select_supplier(p_rfq_id uuid, p_quote_id uuid, p_offer_id uuid default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_user();
  r public.rfqs;
  q public.quotes;
  o public.offers;
  qty integer;
  unit bigint;
  amount bigint;
  sel uuid;
begin
  select * into r from public.rfqs where id = p_rfq_id and buyer_id = uid for update;
  if r.id is null then
    raise exception 'Request not found' using errcode = 'P0002';
  end if;
  select id into sel from public.selections where rfq_id = p_rfq_id and quote_id = p_quote_id;
  if sel is not null then
    return sel;
  end if;
  if r.status <> 'quoting' then
    raise exception 'A supplier can be selected only while quotes are open' using errcode = '22023';
  end if;
  select * into q from public.quotes where id = p_quote_id and rfq_id = p_rfq_id;
  if q.id is null or q.id is distinct from (private.latest_quote(p_rfq_id, q.supplier_id)).id then
    raise exception 'Pick the supplier''s latest quote' using errcode = '22023';
  end if;
  if q.valid_until < private.manila_today() then
    raise exception 'This quote has expired; ask the supplier to revise it' using errcode = '22023';
  end if;

  if p_offer_id is not null then
    select * into o from public.offers where id = p_offer_id and quote_id = q.id and action = 'accept';
    if o.id is null then
      raise exception 'That counteroffer was not accepted on this quote' using errcode = '22023';
    end if;
    qty := o.quantity;
    unit := o.unit_price_centavos;
  else
    qty := q.quantity;
    unit := coalesce((
      select (t ->> 'unitPriceCentavos')::bigint from jsonb_array_elements(q.price_tiers) t
      where (t ->> 'minQty')::integer <= qty order by (t ->> 'minQty')::integer desc limit 1
    ), q.unit_price_centavos);
  end if;
  amount := unit * qty + coalesce(q.setup_fee_centavos, 0) + coalesce(q.shipping_fee_centavos, 0) + coalesce(q.tax_centavos, 0);

  insert into public.selections (rfq_id, buyer_id, supplier_id, quote_id, offer_id, amount_centavos, amount_is_estimate)
  values (p_rfq_id, uid, q.supplier_id, q.id, o.id, amount,
    q.setup_fee_centavos is null or q.shipping_fee_centavos is null or q.tax_centavos is null)
  returning id into sel;
  perform private.set_rfq_status(p_rfq_id, 'quoting', 'supplier_selected');

  perform private.notify(s.owner_id, 'You were selected', r.ref || ': the buyer selected your quote. Their contact details are now visible.',
    '/supplier/rfqs/' || r.id)
  from public.suppliers s where s.id = q.supplier_id;
  insert into public.notifications (user_id, title, body, link)
  select s.owner_id, 'RFQ closed', r.ref || ': the buyer selected another supplier.', '/supplier/rfqs/' || r.id
  from public.rfq_invites i join public.suppliers s on s.id = i.supplier_id
  where i.rfq_id = p_rfq_id and i.supplier_id <> q.supplier_id and i.status <> 'declined';
  perform private.audit('rfq.select', 'selections', sel::text,
    jsonb_build_object('rfq_id', p_rfq_id, 'quote_id', q.id, 'offer_id', o.id, 'amount_centavos', amount));
  return sel;
end $$;

-- ---------------------------------------------------------------- messages and notifications

-- One thread per RFQ and invited supplier. Open from the invite until the RFQ is cancelled.
create function public.send_rfq_message(p_rfq_id uuid, p_supplier_id uuid, p_body text) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_user();
  r public.rfqs;
  owner uuid;
  inv public.invite_status;
  body text := btrim(coalesce(p_body, ''));
  new_id bigint;
begin
  select * into r from public.rfqs where id = p_rfq_id;
  select owner_id into owner from public.suppliers where id = p_supplier_id;
  select status into inv from public.rfq_invites where rfq_id = p_rfq_id and supplier_id = p_supplier_id;
  if r.id is null or inv is null or uid not in (r.buyer_id, owner) then
    raise exception 'Conversation not found' using errcode = 'P0002';
  end if;
  if inv = 'declined' or r.status = 'cancelled' then
    raise exception 'This conversation is closed' using errcode = '22023';
  end if;
  if body = '' or char_length(body) > 2000 then
    raise exception 'Messages are 1 to 2000 characters' using errcode = '22023';
  end if;
  -- shortcut: no per-user message rate limit yet; add one (admin setting) before opening sign-ups widely.
  insert into public.rfq_messages (rfq_id, supplier_id, sender_id, body) values (p_rfq_id, p_supplier_id, uid, body)
  returning id into new_id;
  perform private.notify(case when uid = r.buyer_id then owner else r.buyer_id end, 'New message', r.ref || ': ' || left(body, 120),
    case when uid = r.buyer_id then '/supplier/messages' else '/buyer/messages' end);
  return new_id;
end $$;

create function public.mark_notifications_read() returns void
language sql security definer set search_path = '' as $$
  update public.notifications set read_at = now() where user_id = auth.uid() and read_at is null;
$$;

-- ---------------------------------------------------------------- privileges + RLS

revoke all on public.rfqs, public.rfq_status_history, public.rfq_invites, public.quotes, public.offers, public.selections,
  public.rfq_messages, public.notifications from anon, authenticated;
grant select on public.rfqs, public.rfq_status_history, public.rfq_invites, public.quotes, public.offers, public.selections,
  public.rfq_messages, public.notifications to authenticated;

alter table public.rfqs enable row level security;
alter table public.rfq_status_history enable row level security;
alter table public.rfq_invites enable row level security;
alter table public.quotes enable row level security;
alter table public.offers enable row level security;
alter table public.selections enable row level security;
alter table public.rfq_messages enable row level security;
alter table public.notifications enable row level security;

create policy "rfqs: buyer, invited supplier or support" on public.rfqs for select to authenticated
  using (
    buyer_id = (select auth.uid())
    or (select public.has_admin_role('support'))
    or exists (select 1 from public.rfq_invites i where i.rfq_id = id and i.supplier_id = (select public.my_supplier_id()))
  );
create policy "rfq_status_history: buyer or support" on public.rfq_status_history for select to authenticated
  using ((select public.is_rfq_buyer(rfq_id)) or (select public.has_admin_role('support')));
create policy "rfq_invites: buyer, the supplier or support" on public.rfq_invites for select to authenticated
  using (
    supplier_id = (select public.my_supplier_id())
    or (select public.is_rfq_buyer(rfq_id))
    or (select public.has_admin_role('support'))
  );
-- Suppliers see only their own quotes and threads, never a competitor's.
create policy "quotes: buyer, the supplier or support" on public.quotes for select to authenticated
  using (
    supplier_id = (select public.my_supplier_id())
    or (select public.is_rfq_buyer(rfq_id))
    or (select public.has_admin_role('support'))
  );
create policy "offers: buyer, the supplier or support" on public.offers for select to authenticated
  using (
    supplier_id = (select public.my_supplier_id())
    or (select public.is_rfq_buyer(rfq_id))
    or (select public.has_admin_role('support'))
  );
create policy "selections: buyer, the selected supplier or support" on public.selections for select to authenticated
  using (
    buyer_id = (select auth.uid())
    or supplier_id = (select public.my_supplier_id())
    or (select public.has_admin_role('support'))
  );
create policy "rfq_messages: thread parties or support" on public.rfq_messages for select to authenticated
  using (
    supplier_id = (select public.my_supplier_id())
    or (select public.is_rfq_buyer(rfq_id))
    or (select public.has_admin_role('support'))
  );
create policy "notifications: own" on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));

-- The buyer's contact details are revealed only to the supplier they selected.
create policy "profiles: selected supplier reads the buyer" on public.profiles for select to authenticated
  using (exists (
    select 1 from public.selections sel
    where sel.buyer_id = profiles.id and sel.supplier_id = (select public.my_supplier_id())
  ));

revoke execute on all functions in schema private from public, anon, authenticated;
revoke execute on function
  public.my_supplier_id(), public.is_rfq_buyer(uuid),
  public.save_rfq(uuid, uuid, text, text, text, text, integer, public.product_unit, text, text, date, bigint, boolean,
    public.delivery_preference, boolean, boolean),
  public.cancel_rfq(uuid, text),
  public.admin_review_rfq(uuid, text, text),
  public.admin_suggest_suppliers(uuid),
  public.admin_invite_suppliers(uuid, uuid[]),
  public.respond_rfq_invite(uuid, boolean),
  public.submit_quote(uuid, uuid, integer, bigint, bigint, bigint, bigint, integer, date, text, text, public.delivery_terms,
    public.bir_invoice, jsonb),
  public.make_offer(uuid, uuid, uuid, public.offer_action, uuid, integer, bigint, integer, text, text),
  public.select_supplier(uuid, uuid, uuid),
  public.send_rfq_message(uuid, uuid, text),
  public.mark_notifications_read()
  from public, anon;
grant execute on function
  public.my_supplier_id(), public.is_rfq_buyer(uuid),
  public.save_rfq(uuid, uuid, text, text, text, text, integer, public.product_unit, text, text, date, bigint, boolean,
    public.delivery_preference, boolean, boolean),
  public.cancel_rfq(uuid, text),
  public.admin_review_rfq(uuid, text, text),
  public.admin_suggest_suppliers(uuid),
  public.admin_invite_suppliers(uuid, uuid[]),
  public.respond_rfq_invite(uuid, boolean),
  public.submit_quote(uuid, uuid, integer, bigint, bigint, bigint, bigint, integer, date, text, text, public.delivery_terms,
    public.bir_invoice, jsonb),
  public.make_offer(uuid, uuid, uuid, public.offer_action, uuid, integer, bigint, integer, text, text),
  public.select_supplier(uuid, uuid, uuid),
  public.send_rfq_message(uuid, uuid, text),
  public.mark_notifications_read()
  to authenticated;
