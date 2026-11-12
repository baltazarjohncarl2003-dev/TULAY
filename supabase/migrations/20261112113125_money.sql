-- Stage 4 Money: variants and stock, carts, checkout (one payment -> one order per supplier),
-- payments and webhook events, a double-entry ledger, refunds and supplier payouts.
--
-- TULAY never holds buyer money: the gateway (PayMongo; a local fake until the permit) collects it.
-- These tables only RECORD what happened. All amounts are integer centavos.
--
-- Ledger per paid order (total T, commission C, gateway fee F, borne by the supplier):
--   dr gateway_clearing T-F | dr supplier_payable F | cr supplier_payable T-C | cr platform_revenue C
-- Refund R:   dr supplier_payable R-c | dr platform_revenue c | cr gateway_clearing R   (c = C*R/T)
-- Payout P:   dr supplier_payable P | cr gateway_clearing P
-- Payments that match no open checkout go to unmatched_payments until refunded.
--
-- Money-moving functions that only the gateway may trigger (confirm_payment, fail_payment,
-- complete_refund) are executable by service_role only (the webhook route / server code).

-- ---------------------------------------------------------------- settings

insert into public.platform_settings (key, value, description) values
  ('checkout_ttl_minutes', '15', 'Minutes a checkout holds stock while the buyer pays.'),
  ('fee_card_bps', '300', 'Card fee in basis points (300 = 3%), paid by the supplier.'),
  ('fee_card_fixed_centavos', '1500', 'Card fee fixed part in centavos (1500 = PHP 15), paid by the supplier.'),
  ('fee_ewallet_bps', '250', 'E-wallet (GCash, Maya) fee in basis points, paid by the supplier.'),
  ('fee_online_banking_bps', '250', 'Online banking fee in basis points, paid by the supplier.');

-- ---------------------------------------------------------------- types

create type public.payment_method as enum ('card', 'ewallet', 'online_banking');
create type public.order_status as enum
  ('pending_payment', 'paid', 'in_production', 'shipped', 'delivered', 'completed', 'cancelled');
create type public.checkout_status as enum ('pending', 'paid', 'expired', 'cancelled', 'needs_review');
create type public.payment_status as enum ('pending', 'paid', 'failed', 'expired', 'needs_review');
create type public.refund_status as enum ('pending', 'succeeded', 'failed');
create type public.payout_status as enum ('scheduled', 'released');
create type public.ledger_account as enum ('gateway_clearing', 'supplier_payable', 'platform_revenue', 'unmatched_payments');
create type public.stock_reason as enum ('adjust', 'reserve', 'release');

-- ---------------------------------------------------------------- variants and stock

-- stock: null = not tracked (made to order). Products with active variants keep stock on the variants.
alter table public.products add column stock integer check (stock >= 0);

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id),
  name text not null check (char_length(name) between 1 and 80),
  price_delta_centavos bigint not null default 0 check (price_delta_centavos between -100000000 and 100000000),
  stock integer check (stock >= 0),
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (product_id, name)
);
create index product_variants_product_idx on public.product_variants (product_id, sort_order);

create table public.stock_movements (
  id bigint generated always as identity primary key,
  product_id uuid not null references public.products (id),
  variant_id uuid references public.product_variants (id),
  delta integer not null check (delta <> 0),
  reason public.stock_reason not null,
  checkout_id uuid,
  actor_id uuid,
  created_at timestamptz not null default now()
);
create index stock_movements_product_idx on public.stock_movements (product_id, created_at);

-- ---------------------------------------------------------------- cart

create table public.cart_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  product_id uuid not null references public.products (id),
  variant_id uuid references public.product_variants (id),
  quantity integer not null check (quantity between 1 and 10000000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (user_id, product_id, variant_id)
);
create trigger cart_items_touch before update on public.cart_items
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------- checkout and orders

create sequence public.order_ref_seq;
create sequence public.payout_ref_seq;

create table public.checkouts (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references public.profiles (id),
  status public.checkout_status not null default 'pending',
  method public.payment_method not null,
  total_centavos bigint not null check (total_centavos > 0),
  selection_id uuid references public.selections (id), -- set when paying for an RFQ deal
  idempotency_key uuid not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (buyer_id, idempotency_key)
);
create index checkouts_open_idx on public.checkouts (status, expires_at);
-- An RFQ deal is paid at most once (an expired attempt may be retried).
create unique index checkouts_selection_once on public.checkouts (selection_id) where status in ('pending', 'paid', 'needs_review');

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique
    default 'ORD-' || to_char(now() at time zone 'Asia/Manila', 'YYYY') || '-' || lpad(nextval('public.order_ref_seq')::text, 5, '0'),
  checkout_id uuid not null references public.checkouts (id),
  buyer_id uuid not null references public.profiles (id),
  supplier_id uuid not null references public.suppliers (id),
  status public.order_status not null default 'pending_payment',
  items_centavos bigint not null check (items_centavos >= 0),
  fees_centavos bigint not null default 0 check (fees_centavos >= 0), -- quoted setup / shipping / tax on RFQ deals
  total_centavos bigint not null check (total_centavos > 0),
  commission_centavos bigint not null default 0 check (commission_centavos >= 0),
  gateway_fee_centavos bigint not null default 0 check (gateway_fee_centavos >= 0),
  paid_at timestamptz,
  delivered_at timestamptz, -- set by Stage 5 delivery tracking
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (total_centavos = items_centavos + fees_centavos)
);
create index orders_buyer_idx on public.orders (buyer_id, created_at desc);
create index orders_supplier_idx on public.orders (supplier_id, created_at desc);
create trigger orders_touch before update on public.orders
  for each row execute function private.touch_updated_at();

-- Prices, commission rate and return class are frozen here at checkout.
create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id),
  product_id uuid references public.products (id), -- null for RFQ deals
  variant_id uuid references public.product_variants (id),
  title text not null,
  variant_name text not null default '',
  unit public.product_unit not null,
  quantity integer not null check (quantity >= 1),
  unit_price_centavos bigint not null check (unit_price_centavos > 0),
  line_total_centavos bigint not null check (line_total_centavos = unit_price_centavos * quantity),
  commission_bps integer not null check (commission_bps between 0 and 10000),
  commission_centavos bigint not null check (commission_centavos >= 0),
  return_class public.return_class not null
);
create index order_items_order_idx on public.order_items (order_id);

create table public.order_status_history (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders (id),
  from_status public.order_status,
  to_status public.order_status not null,
  reason text not null default '',
  actor_id uuid,
  created_at timestamptz not null default now()
);
create index order_status_history_order_idx on public.order_status_history (order_id, created_at);

create table public.stock_reservations (
  id uuid primary key default gen_random_uuid(),
  checkout_id uuid not null references public.checkouts (id),
  order_id uuid references public.orders (id),
  product_id uuid not null references public.products (id),
  variant_id uuid references public.product_variants (id),
  quantity integer not null check (quantity >= 1),
  status text not null default 'active' check (status in ('active', 'released', 'converted')),
  created_at timestamptz not null default now()
);
create index stock_reservations_checkout_idx on public.stock_reservations (checkout_id);

-- ---------------------------------------------------------------- payments, ledger, refunds, payouts

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  checkout_id uuid not null unique references public.checkouts (id),
  method public.payment_method not null,
  amount_centavos bigint not null check (amount_centavos > 0),
  provider text,
  provider_ref text,
  fee_centavos bigint check (fee_centavos >= 0),
  status public.payment_status not null default 'pending',
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_ref)
);
create trigger payments_touch before update on public.payments
  for each row execute function private.touch_updated_at();

-- Every gateway webhook, stored once: a duplicate delivery hits the unique key and changes nothing.
create table public.payment_events (
  id bigint generated always as identity primary key,
  provider text not null,
  event_id text not null,
  type text not null,
  payload jsonb not null default '{}',
  received_at timestamptz not null default now(),
  unique (provider, event_id)
);

create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders (id), -- null = refund of an unmatched payment
  payment_id uuid not null references public.payments (id),
  amount_centavos bigint not null check (amount_centavos > 0),
  reason text not null check (char_length(reason) between 3 and 500),
  status public.refund_status not null default 'pending',
  provider_refund_ref text unique,
  idempotency_key uuid not null unique,
  requested_by uuid,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index refunds_order_idx on public.refunds (order_id);

create table public.payouts (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique default 'PO-' || lpad(nextval('public.payout_ref_seq')::text, 5, '0'),
  supplier_id uuid not null references public.suppliers (id),
  amount_centavos bigint not null check (amount_centavos > 0),
  status public.payout_status not null default 'scheduled',
  provider_ref text not null default '',
  scheduled_at timestamptz not null default now(),
  released_at timestamptz,
  released_by uuid
);

-- amount may be negative: a refund after an earlier payout is deducted from the next one.
create table public.payout_items (
  payout_id uuid not null references public.payouts (id),
  order_id uuid not null references public.orders (id),
  amount_centavos bigint not null check (amount_centavos <> 0),
  primary key (payout_id, order_id)
);

create table public.ledger_entries (
  id bigint generated always as identity primary key,
  txn_id uuid not null, -- every txn balances: sum(debit) = sum(credit)
  account public.ledger_account not null,
  supplier_id uuid references public.suppliers (id),
  order_id uuid references public.orders (id),
  payment_id uuid references public.payments (id),
  refund_id uuid references public.refunds (id),
  payout_id uuid references public.payouts (id),
  debit_centavos bigint not null default 0,
  credit_centavos bigint not null default 0,
  memo text not null default '',
  created_at timestamptz not null default now(),
  check (debit_centavos >= 0 and credit_centavos >= 0 and (debit_centavos > 0) <> (credit_centavos > 0))
);
create index ledger_entries_order_idx on public.ledger_entries (order_id);
create index ledger_entries_supplier_idx on public.ledger_entries (supplier_id, account);

create trigger stock_movements_append_only before update or delete on public.stock_movements
  for each row execute function private.forbid_change();
create trigger order_status_history_append_only before update or delete on public.order_status_history
  for each row execute function private.forbid_change();
create trigger payment_events_append_only before update or delete on public.payment_events
  for each row execute function private.forbid_change();
create trigger ledger_entries_append_only before update or delete on public.ledger_entries
  for each row execute function private.forbid_change();
create trigger ledger_entries_no_truncate before truncate on public.ledger_entries
  for each statement execute function private.forbid_change();
create trigger payout_items_append_only before update or delete on public.payout_items
  for each row execute function private.forbid_change();

-- ---------------------------------------------------------------- internal helpers

create function private.post(
  p_txn uuid, p_account public.ledger_account, p_debit bigint, p_credit bigint, p_memo text,
  p_supplier uuid default null, p_order uuid default null, p_payment uuid default null,
  p_refund uuid default null, p_payout uuid default null
) returns void
language sql security definer set search_path = '' as $$
  insert into public.ledger_entries (txn_id, account, supplier_id, order_id, payment_id, refund_id, payout_id,
    debit_centavos, credit_centavos, memo)
  select p_txn, p_account, p_supplier, p_order, p_payment, p_refund, p_payout, p_debit, p_credit, p_memo
  where p_debit > 0 or p_credit > 0; -- zero lines are skipped (e.g. 0% commission)
$$;

-- Rounds half up: (amount * bps / 10000), integers only.
create function private.bps_of(p_amount bigint, p_bps integer) returns bigint
language sql immutable set search_path = '' as $$
  select (p_amount * p_bps + 5000) / 10000;
$$;

create function private.set_order_status(p_order_id uuid, p_to public.order_status, p_reason text default '') returns void
language plpgsql security definer set search_path = '' as $$
declare cur public.order_status;
begin
  select status into cur from public.orders where id = p_order_id for update;
  if cur = p_to then
    return;
  end if;
  update public.orders set status = p_to,
    cancelled_at = case when p_to = 'cancelled' then now() else cancelled_at end
  where id = p_order_id;
  insert into public.order_status_history (order_id, from_status, to_status, reason, actor_id)
  values (p_order_id, cur, p_to, coalesce(p_reason, ''), auth.uid());
end $$;

-- Puts reserved stock back.
create function private.return_stock(p_reservation public.stock_reservations) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_reservation.variant_id is not null then
    update public.product_variants set stock = stock + p_reservation.quantity
    where id = p_reservation.variant_id and stock is not null;
  else
    update public.products set stock = stock + p_reservation.quantity
    where id = p_reservation.product_id and stock is not null;
  end if;
  insert into public.stock_movements (product_id, variant_id, delta, reason, checkout_id, actor_id)
  values (p_reservation.product_id, p_reservation.variant_id, p_reservation.quantity, 'release', p_reservation.checkout_id, auth.uid());
end $$;

-- Ends an unpaid checkout: payment closed, orders cancelled, reserved stock returned.
create function private.release_checkout(p_checkout_id uuid, p_status public.checkout_status, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  res public.stock_reservations;
  o uuid;
begin
  update public.checkouts set status = p_status where id = p_checkout_id and status = 'pending';
  if not found then
    return;
  end if;
  update public.payments set status = case when p_status = 'expired' then 'expired' else 'failed' end::public.payment_status
  where checkout_id = p_checkout_id and status = 'pending';
  for o in select id from public.orders where checkout_id = p_checkout_id loop
    perform private.set_order_status(o, 'cancelled', p_reason);
  end loop;
  for res in select * from public.stock_reservations where checkout_id = p_checkout_id and status = 'active' for update loop
    perform private.return_stock(res);
    update public.stock_reservations set status = 'released' where id = res.id;
  end loop;
end $$;

-- Reserves stock for one line (no-op when not tracked). Raises when not enough is left.
create function private.reserve_stock(p_checkout_id uuid, p_product_id uuid, p_variant_id uuid, p_qty integer, p_title text) returns void
language plpgsql security definer set search_path = '' as $$
declare tracked boolean;
begin
  if p_variant_id is not null then
    select stock is not null into tracked from public.product_variants where id = p_variant_id;
    if tracked then
      update public.product_variants set stock = stock - p_qty where id = p_variant_id and stock >= p_qty;
    end if;
  else
    select stock is not null into tracked from public.products where id = p_product_id;
    if tracked then
      update public.products set stock = stock - p_qty where id = p_product_id and stock >= p_qty;
    end if;
  end if;
  if not tracked then
    return;
  end if;
  if not found then
    raise exception 'Not enough stock left for %', p_title using errcode = '22023';
  end if;
  insert into public.stock_reservations (checkout_id, product_id, variant_id, quantity)
  values (p_checkout_id, p_product_id, p_variant_id, p_qty);
  insert into public.stock_movements (product_id, variant_id, delta, reason, checkout_id, actor_id)
  values (p_product_id, p_variant_id, -p_qty, 'reserve', p_checkout_id, auth.uid());
end $$;

-- The open checkout's orders, items and payment, from a list of lines:
-- [{supplierId, productId, variantId, title, variantName, unit, quantity, unitPrice, bps, returnClass}]
create function private.create_orders(p_checkout_id uuid, p_buyer uuid, p_lines jsonb, p_fees bigint default 0) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  sup uuid;
  ord uuid;
  items bigint;
  comm bigint;
  total bigint := 0;
begin
  for sup in select distinct (l ->> 'supplierId')::uuid from jsonb_array_elements(p_lines) l loop
    select sum((l ->> 'unitPrice')::bigint * (l ->> 'quantity')::integer),
           sum(private.bps_of((l ->> 'unitPrice')::bigint * (l ->> 'quantity')::integer, (l ->> 'bps')::integer))
    into items, comm
    from jsonb_array_elements(p_lines) l where (l ->> 'supplierId')::uuid = sup;
    insert into public.orders (checkout_id, buyer_id, supplier_id, items_centavos, fees_centavos, total_centavos, commission_centavos)
    values (p_checkout_id, p_buyer, sup, items, p_fees, items + p_fees, comm)
    returning id into ord;
    insert into public.order_items (order_id, product_id, variant_id, title, variant_name, unit, quantity, unit_price_centavos,
      line_total_centavos, commission_bps, commission_centavos, return_class)
    select ord, nullif(l ->> 'productId', '')::uuid, nullif(l ->> 'variantId', '')::uuid, l ->> 'title', coalesce(l ->> 'variantName', ''),
      (l ->> 'unit')::public.product_unit, (l ->> 'quantity')::integer, (l ->> 'unitPrice')::bigint,
      (l ->> 'unitPrice')::bigint * (l ->> 'quantity')::integer, (l ->> 'bps')::integer,
      private.bps_of((l ->> 'unitPrice')::bigint * (l ->> 'quantity')::integer, (l ->> 'bps')::integer),
      (l ->> 'returnClass')::public.return_class
    from jsonb_array_elements(p_lines) l where (l ->> 'supplierId')::uuid = sup;
    insert into public.order_status_history (order_id, from_status, to_status, actor_id) values (ord, null, 'pending_payment', p_buyer);
    update public.stock_reservations r set order_id = ord
    from public.products p where r.checkout_id = p_checkout_id and r.product_id = p.id and p.supplier_id = sup;
    total := total + items + p_fees;
  end loop;
  return total;
end $$;

-- ---------------------------------------------------------------- buyer: checkout

-- Checks out the caller's cart in one payment: one order per supplier, prices and commission frozen,
-- tracked stock reserved for checkout_ttl_minutes. A retry with the same key returns the same checkout.
-- Starting a new checkout cancels the caller's previous unpaid one.
create function public.start_checkout(p_idempotency_key uuid, p_method public.payment_method)
returns table (checkout_id uuid, amount_centavos bigint)
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_user();
  co public.checkouts;
  old uuid;
  it record;
  unit bigint;
  lines jsonb := '[]';
  total bigint;
begin
  if (select role from public.profiles where id = uid) = 'admin' then
    raise exception 'Admin accounts cannot buy; use a separate account' using errcode = '42501';
  end if;
  if p_idempotency_key is null then
    raise exception 'Idempotency key required' using errcode = '22023';
  end if;
  select * into co from public.checkouts c where c.buyer_id = uid and c.idempotency_key = p_idempotency_key;
  if co.id is not null then
    return query select co.id, co.total_centavos;
    return;
  end if;
  for old in select c.id from public.checkouts c where c.buyer_id = uid and c.status = 'pending' and c.selection_id is null for update loop
    perform private.release_checkout(old, 'cancelled', 'Replaced by a new checkout');
  end loop;

  insert into public.checkouts (buyer_id, method, total_centavos, idempotency_key, expires_at)
  values (uid, p_method, 1, p_idempotency_key, now() + make_interval(mins => coalesce(private.setting_int('checkout_ttl_minutes'), 15)))
  returning * into co;

  for it in
    select c.product_id, c.variant_id, c.quantity, p.title, p.moq, p.unit, p.indicative_price_centavos, p.return_class,
      p.category_id, p.status as product_status, p.supplier_id, s.status as supplier_status, s.owner_id,
      v.name as variant_name, v.price_delta_centavos, v.active as variant_active, v.product_id as variant_product,
      exists (select 1 from public.product_variants x where x.product_id = p.id and x.active) as has_variants
    from public.cart_items c
    join public.products p on p.id = c.product_id
    join public.suppliers s on s.id = p.supplier_id
    left join public.product_variants v on v.id = c.variant_id
    where c.user_id = uid
    order by p.supplier_id, p.id, v.id
  loop
    if it.product_status <> 'approved' or it.supplier_status <> 'verified' then
      raise exception '"%" is no longer available', it.title using errcode = '22023';
    end if;
    if it.owner_id = uid then
      raise exception 'You cannot buy your own listing "%"', it.title using errcode = '22023';
    end if;
    if it.variant_id is null and it.has_variants then
      raise exception 'Pick an option for "%"', it.title using errcode = '22023';
    end if;
    if it.variant_id is not null and (it.variant_product is distinct from it.product_id or not it.variant_active) then
      raise exception 'That option of "%" is no longer available', it.title using errcode = '22023';
    end if;
    if it.quantity < it.moq then
      raise exception 'The minimum order for "%" is %', it.title, it.moq using errcode = '22023';
    end if;
    unit := coalesce((
      select t.unit_price_centavos from public.price_tiers t
      where t.product_id = it.product_id and t.min_qty <= it.quantity order by t.min_qty desc limit 1
    ), it.indicative_price_centavos);
    if unit is null then
      raise exception '"%" is priced on request; send an RFQ instead', it.title using errcode = '22023';
    end if;
    unit := unit + coalesce(it.price_delta_centavos, 0);
    if unit <= 0 then
      raise exception 'The price of "%" is not valid', it.title using errcode = '22023';
    end if;
    perform private.reserve_stock(co.id, it.product_id, it.variant_id, it.quantity, it.title);
    lines := lines || jsonb_build_object(
      'supplierId', it.supplier_id, 'productId', it.product_id, 'variantId', coalesce(it.variant_id::text, ''),
      'title', it.title, 'variantName', coalesce(it.variant_name, ''), 'unit', it.unit, 'quantity', it.quantity,
      'unitPrice', unit, 'bps', public.commission_rate_bps(it.category_id, now()), 'returnClass', it.return_class);
  end loop;
  if jsonb_array_length(lines) = 0 then
    raise exception 'Your cart is empty' using errcode = '22023';
  end if;

  total := private.create_orders(co.id, uid, lines);
  update public.checkouts set total_centavos = total where id = co.id;
  insert into public.payments (checkout_id, method, amount_centavos) values (co.id, p_method, total);
  perform private.audit('checkout.start', 'checkouts', co.id::text, jsonb_build_object('total_centavos', total, 'method', p_method));
  return query select co.id, total;
end $$;

-- Pays for an RFQ deal at its recorded amount (agreed unit price x quantity + the fees the supplier quoted).
create function public.start_selection_checkout(p_selection_id uuid, p_idempotency_key uuid, p_method public.payment_method)
returns table (checkout_id uuid, amount_centavos bigint)
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_user();
  sel public.selections;
  r public.rfqs;
  q public.quotes;
  o public.offers;
  co public.checkouts;
  qty integer;
  unit bigint;
  total bigint;
begin
  if p_idempotency_key is null then
    raise exception 'Idempotency key required' using errcode = '22023';
  end if;
  select * into co from public.checkouts c where c.buyer_id = uid and c.idempotency_key = p_idempotency_key;
  if co.id is not null then
    return query select co.id, co.total_centavos;
    return;
  end if;
  select * into sel from public.selections where id = p_selection_id and buyer_id = uid for update;
  if sel.id is null then
    raise exception 'Deal not found' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.checkouts c where c.selection_id = sel.id and c.status in ('pending', 'paid', 'needs_review')) then
    raise exception 'This deal already has a checkout' using errcode = '22023';
  end if;
  if not exists (select 1 from public.suppliers where id = sel.supplier_id and status = 'verified') then
    raise exception 'This supplier cannot take orders right now' using errcode = '22023';
  end if;
  select * into r from public.rfqs where id = sel.rfq_id;
  select * into q from public.quotes where id = sel.quote_id;
  if sel.offer_id is not null then
    select * into o from public.offers where id = sel.offer_id;
    qty := o.quantity;
    unit := o.unit_price_centavos;
  else
    qty := q.quantity;
    unit := coalesce((
      select (t ->> 'unitPriceCentavos')::bigint from jsonb_array_elements(q.price_tiers) t
      where (t ->> 'minQty')::integer <= qty order by (t ->> 'minQty')::integer desc limit 1
    ), q.unit_price_centavos);
  end if;

  insert into public.checkouts (buyer_id, method, total_centavos, selection_id, idempotency_key, expires_at)
  values (uid, p_method, sel.amount_centavos, sel.id, p_idempotency_key,
    now() + make_interval(mins => coalesce(private.setting_int('checkout_ttl_minutes'), 15)))
  returning * into co;
  total := private.create_orders(co.id, uid, jsonb_build_array(jsonb_build_object(
      'supplierId', sel.supplier_id, 'productId', '', 'variantId', '', 'title', r.product, 'variantName', '',
      'unit', r.unit, 'quantity', qty, 'unitPrice', unit, 'bps', public.commission_rate_bps(r.category_id, now()),
      'returnClass', 'custom')),
    sel.amount_centavos - unit * qty);
  if total <> sel.amount_centavos then
    raise exception 'Deal amount mismatch' using errcode = 'XX000';
  end if;
  insert into public.payments (checkout_id, method, amount_centavos) values (co.id, p_method, total);
  perform private.audit('checkout.start', 'checkouts', co.id::text, jsonb_build_object('selection_id', sel.id, 'total_centavos', total));
  return query select co.id, total;
end $$;

-- Records the gateway session the server created for this checkout's payment.
create function public.attach_payment_session(p_checkout_id uuid, p_provider text, p_provider_ref text) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.require_user();
begin
  update public.payments pay set provider = p_provider, provider_ref = p_provider_ref
  from public.checkouts c
  where pay.checkout_id = c.id and c.id = p_checkout_id and c.buyer_id = uid and c.status = 'pending'
    and pay.status = 'pending' and pay.provider_ref is null;
  if not found then
    raise exception 'Checkout not found or already started' using errcode = 'P0002';
  end if;
end $$;

-- Buyer: cancel a paid order before production starts. Returns the full refund to send to the gateway.
create function public.cancel_order(p_order_id uuid, p_reason text default '') returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_user();
  o public.orders;
  res public.stock_reservations;
  rid uuid;
begin
  select * into o from public.orders where id = p_order_id and buyer_id = uid for update;
  if o.id is null then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;
  if o.status <> 'paid' then
    raise exception 'Only paid orders that are not in production yet can be cancelled' using errcode = '22023';
  end if;
  perform private.set_order_status(o.id, 'cancelled', coalesce(nullif(btrim(p_reason), ''), 'Cancelled by the buyer'));
  for res in select * from public.stock_reservations where order_id = o.id and status = 'converted' for update loop
    perform private.return_stock(res);
    update public.stock_reservations set status = 'released' where id = res.id;
  end loop;
  -- Nothing to refund if finance already refunded the whole order.
  insert into public.refunds (order_id, payment_id, amount_centavos, reason, idempotency_key, requested_by)
  select o.id, p.id, x.left_centavos, 'Order cancelled by the buyer', gen_random_uuid(), uid
  from public.payments p
  cross join lateral (select o.total_centavos - coalesce((select sum(amount_centavos) from public.refunds
      where order_id = o.id and status <> 'failed'), 0) as left_centavos) x
  where p.checkout_id = o.checkout_id and x.left_centavos > 0
  returning id into rid;
  perform private.notify(s.owner_id, 'Order cancelled', o.ref || ' was cancelled by the buyer before production.',
    '/supplier/orders/' || o.id)
  from public.suppliers s where s.id = o.supplier_id;
  perform private.audit('order.cancel', 'orders', o.id::text, jsonb_build_object('refund_id', rid));
  return rid;
end $$;

-- ---------------------------------------------------------------- gateway (service_role only)

-- Payment confirmed by the gateway webhook (signature already verified by the route).
-- Returns: paid | duplicate | already_paid | unknown | needs_review
create function public.confirm_payment(
  p_provider text, p_event_id text, p_provider_ref text, p_amount_centavos bigint, p_fee_centavos bigint, p_payload jsonb
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  pay public.payments;
  co public.checkouts;
  fee bigint;
  o record;
  given bigint := 0;
  share bigint;
  first_order uuid;
  txn uuid;
begin
  insert into public.payment_events (provider, event_id, type, payload)
  values (p_provider, p_event_id, 'payment.paid', coalesce(p_payload, '{}'))
  on conflict do nothing;
  if not found then
    return 'duplicate';
  end if;

  select * into pay from public.payments where provider = p_provider and provider_ref = p_provider_ref for update;
  if pay.id is null then
    perform private.audit('payment.unknown', 'payment_events', p_event_id, jsonb_build_object('provider_ref', p_provider_ref));
    return 'unknown';
  end if;
  if pay.status = 'paid' then
    return 'already_paid';
  end if;
  select * into co from public.checkouts where id = pay.checkout_id for update;
  fee := coalesce(p_fee_centavos, case pay.method
    when 'card' then private.bps_of(pay.amount_centavos, private.setting_int('fee_card_bps')) + private.setting_int('fee_card_fixed_centavos')
    when 'ewallet' then private.bps_of(pay.amount_centavos, private.setting_int('fee_ewallet_bps'))
    else private.bps_of(pay.amount_centavos, private.setting_int('fee_online_banking_bps')) end);

  -- Money arrived for a checkout that already closed, or for the wrong amount: park it for a finance refund.
  if co.status <> 'pending' or p_amount_centavos is distinct from pay.amount_centavos then
    update public.payments set status = 'needs_review', paid_at = now(), fee_centavos = fee where id = pay.id;
    if co.status = 'pending' then
      update public.checkouts set status = 'needs_review' where id = co.id;
    end if;
    txn := gen_random_uuid();
    perform private.post(txn, 'gateway_clearing', p_amount_centavos, 0, 'Unmatched payment', p_payment => pay.id);
    perform private.post(txn, 'unmatched_payments', 0, p_amount_centavos, 'Unmatched payment', p_payment => pay.id);
    perform private.notify_support('Payment needs review', 'A payment did not match an open checkout.', '/admin/payments');
    perform private.audit('payment.needs_review', 'payments', pay.id::text,
      jsonb_build_object('checkout_status', co.status, 'amount_centavos', p_amount_centavos));
    return 'needs_review';
  end if;

  update public.payments set status = 'paid', paid_at = now(), fee_centavos = fee where id = pay.id;
  update public.checkouts set status = 'paid' where id = co.id;

  -- Fee split by order total (largest order takes the rounding remainder).
  for o in select id, total_centavos from public.orders where checkout_id = co.id order by total_centavos desc, id loop
    share := (fee * o.total_centavos) / pay.amount_centavos;
    if first_order is null then
      first_order := o.id;
    end if;
    update public.orders set gateway_fee_centavos = share where id = o.id;
    given := given + share;
  end loop;
  update public.orders set gateway_fee_centavos = gateway_fee_centavos + (fee - given) where id = first_order;

  for o in select * from public.orders where checkout_id = co.id loop
    perform private.set_order_status(o.id, 'paid', 'Payment confirmed');
    update public.orders set paid_at = now() where id = o.id;
    txn := gen_random_uuid();
    perform private.post(txn, 'gateway_clearing', o.total_centavos - o.gateway_fee_centavos, 0, 'Order paid', o.supplier_id, o.id, pay.id);
    perform private.post(txn, 'supplier_payable', o.gateway_fee_centavos, 0, 'Gateway fee', o.supplier_id, o.id, pay.id);
    perform private.post(txn, 'supplier_payable', 0, o.total_centavos - o.commission_centavos, 'Order paid', o.supplier_id, o.id, pay.id);
    perform private.post(txn, 'platform_revenue', 0, o.commission_centavos, 'Commission', o.supplier_id, o.id, pay.id);
    perform private.notify(s.owner_id, 'New paid order', o.ref || ' is paid and ready for you.', '/supplier/orders/' || o.id)
    from public.suppliers s where s.id = o.supplier_id;
  end loop;
  update public.stock_reservations set status = 'converted' where checkout_id = co.id and status = 'active';
  delete from public.cart_items c
  where c.user_id = co.buyer_id and exists (
    select 1 from public.order_items i join public.orders x on x.id = i.order_id
    where x.checkout_id = co.id and i.product_id = c.product_id and i.variant_id is not distinct from c.variant_id);
  perform private.notify(co.buyer_id, 'Payment received', 'Thank you. Your order is confirmed.', '/buyer/orders');
  perform private.audit('payment.paid', 'payments', pay.id::text, jsonb_build_object('fee_centavos', fee, 'event_id', p_event_id));
  return 'paid';
end $$;

-- Payment failed or was abandoned at the gateway: close the checkout and return the stock.
create function public.fail_payment(p_provider text, p_event_id text, p_provider_ref text, p_payload jsonb) returns text
language plpgsql security definer set search_path = '' as $$
declare pay public.payments;
begin
  insert into public.payment_events (provider, event_id, type, payload)
  values (p_provider, p_event_id, 'payment.failed', coalesce(p_payload, '{}'))
  on conflict do nothing;
  if not found then
    return 'duplicate';
  end if;
  select * into pay from public.payments where provider = p_provider and provider_ref = p_provider_ref for update;
  if pay.id is null or pay.status <> 'pending' then
    return 'ignored';
  end if;
  perform private.release_checkout(pay.checkout_id, 'cancelled', 'Payment failed');
  update public.payments set status = 'failed' where id = pay.id;
  perform private.audit('payment.failed', 'payments', pay.id::text, jsonb_build_object('event_id', p_event_id));
  return 'failed';
end $$;

-- The gateway answered a refund request. Success writes the reversing ledger rows.
create function public.complete_refund(p_refund_id uuid, p_provider_refund_ref text, p_success boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  rf public.refunds;
  o public.orders;
  comm bigint;
  txn uuid := gen_random_uuid();
begin
  select * into rf from public.refunds where id = p_refund_id for update;
  if rf.id is null then
    raise exception 'Refund not found' using errcode = 'P0002';
  end if;
  if rf.status <> 'pending' then
    return; -- already settled (retry or duplicate webhook)
  end if;
  update public.refunds set status = case when p_success then 'succeeded' else 'failed' end::public.refund_status,
    provider_refund_ref = p_provider_refund_ref, completed_at = now()
  where id = rf.id;
  if not p_success then
    perform private.audit('refund.failed', 'refunds', rf.id::text);
    return;
  end if;
  if rf.order_id is null then
    perform private.post(txn, 'unmatched_payments', rf.amount_centavos, 0, 'Unmatched payment refunded', p_payment => rf.payment_id, p_refund => rf.id);
    perform private.post(txn, 'gateway_clearing', 0, rf.amount_centavos, 'Unmatched payment refunded', p_payment => rf.payment_id, p_refund => rf.id);
  else
    select * into o from public.orders where id = rf.order_id;
    comm := (o.commission_centavos * rf.amount_centavos) / o.total_centavos;
    perform private.post(txn, 'supplier_payable', rf.amount_centavos - comm, 0, 'Refund', o.supplier_id, o.id, rf.payment_id, rf.id);
    perform private.post(txn, 'platform_revenue', comm, 0, 'Commission returned', o.supplier_id, o.id, rf.payment_id, rf.id);
    perform private.post(txn, 'gateway_clearing', 0, rf.amount_centavos, 'Refund', o.supplier_id, o.id, rf.payment_id, rf.id);
    perform private.notify(o.buyer_id, 'Refund sent', o.ref || ': your refund is on its way to your original payment method.',
      '/buyer/orders/' || o.id);
  end if;
  perform private.audit('refund.succeeded', 'refunds', rf.id::text, jsonb_build_object('amount_centavos', rf.amount_centavos));
end $$;

-- ---------------------------------------------------------------- finance admin

-- Refund part or all of a paid order (never more than is still refundable). Returns the refund to send.
create function public.admin_create_refund(p_order_id uuid, p_amount_centavos bigint, p_reason text, p_idempotency_key uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  o public.orders;
  refundable bigint;
  rid uuid;
begin
  if not public.has_admin_role('finance') then
    raise exception 'Finance role with MFA required' using errcode = '42501';
  end if;
  select id into rid from public.refunds where idempotency_key = p_idempotency_key;
  if rid is not null then
    return rid;
  end if;
  select * into o from public.orders where id = p_order_id for update;
  if o.id is null then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;
  if o.paid_at is null then
    raise exception 'This order was never paid' using errcode = '22023';
  end if;
  refundable := o.total_centavos - coalesce((select sum(amount_centavos) from public.refunds where order_id = o.id and status <> 'failed'), 0);
  if p_amount_centavos is null or p_amount_centavos <= 0 or p_amount_centavos > refundable then
    raise exception 'Refund must be between 1 and % centavos', refundable using errcode = '22023';
  end if;
  insert into public.refunds (order_id, payment_id, amount_centavos, reason, idempotency_key, requested_by)
  select o.id, p.id, p_amount_centavos, btrim(coalesce(p_reason, '')), p_idempotency_key, auth.uid()
  from public.payments p where p.checkout_id = o.checkout_id
  returning id into rid;
  perform private.audit('refund.request', 'refunds', rid::text,
    jsonb_build_object('order_id', o.id, 'amount_centavos', p_amount_centavos, 'reason', p_reason));
  return rid;
end $$;

-- Refund a payment that matched no open checkout (status needs_review), in full.
create function public.admin_refund_unmatched(p_payment_id uuid, p_idempotency_key uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  pay public.payments;
  rid uuid;
begin
  if not public.has_admin_role('finance') then
    raise exception 'Finance role with MFA required' using errcode = '42501';
  end if;
  select id into rid from public.refunds where idempotency_key = p_idempotency_key;
  if rid is not null then
    return rid;
  end if;
  select * into pay from public.payments where id = p_payment_id for update;
  if pay.status <> 'needs_review' then
    raise exception 'Only payments that need review can be refunded here' using errcode = '22023';
  end if;
  if exists (select 1 from public.refunds where payment_id = pay.id and order_id is null and status <> 'failed') then
    raise exception 'This payment already has a refund' using errcode = '22023';
  end if;
  insert into public.refunds (order_id, payment_id, amount_centavos, reason, idempotency_key, requested_by)
  values (null, pay.id, pay.amount_centavos, 'Payment did not match an open checkout', p_idempotency_key, auth.uid())
  returning id into rid;
  perform private.audit('refund.request', 'refunds', rid::text, jsonb_build_object('payment_id', pay.id));
  return rid;
end $$;

-- Groups what each supplier is owed into a scheduled payout: delivered orders past payout_delay_days,
-- plus any balance left on earlier orders (a negative one = a refund after payout, deducted here).
create function private.schedule_payouts() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  sup uuid;
  amount bigint;
  pid uuid;
  made integer := 0;
  delay integer := coalesce(private.setting_int('payout_delay_days'), 7);
begin
  for sup in select distinct supplier_id from public.orders where paid_at is not null loop
    create temp table if not exists due (order_id uuid, balance bigint) on commit drop;
    truncate due;
    insert into due
    select o.id, b.balance
    from public.orders o
    cross join lateral (
      select coalesce(sum(e.credit_centavos - e.debit_centavos), 0) as balance
      from public.ledger_entries e where e.order_id = o.id and e.account = 'supplier_payable'
    ) b
    where o.supplier_id = sup and b.balance <> 0
      and not exists (select 1 from public.payout_items pi join public.payouts p on p.id = pi.payout_id
                      where pi.order_id = o.id and p.status = 'scheduled')
      and (
        (o.status in ('delivered', 'completed') and o.delivered_at <= now() - make_interval(days => delay))
        or exists (select 1 from public.payout_items pi where pi.order_id = o.id) -- carried balance
        or (o.status = 'cancelled' and b.balance < 0) -- gateway fee kept on a refunded cancellation
      );
    select coalesce(sum(balance), 0) into amount from due;
    if amount > 0 then
      insert into public.payouts (supplier_id, amount_centavos) values (sup, amount) returning id into pid;
      insert into public.payout_items (payout_id, order_id, amount_centavos) select pid, order_id, balance from due;
      made := made + 1;
    end if;
  end loop;
  return made;
end $$;

-- Finance marks a scheduled payout as sent (gateway split payouts are wired with PayMongo later).
create function public.admin_release_payout(p_payout_id uuid, p_provider_ref text default '') returns void
language plpgsql security definer set search_path = '' as $$
declare
  po public.payouts;
  it record;
  txn uuid := gen_random_uuid();
begin
  if not public.has_admin_role('finance') then
    raise exception 'Finance role with MFA required' using errcode = '42501';
  end if;
  select * into po from public.payouts where id = p_payout_id for update;
  if po.id is null then
    raise exception 'Payout not found' using errcode = 'P0002';
  end if;
  if po.status <> 'scheduled' then
    raise exception 'This payout was already released' using errcode = '22023';
  end if;
  for it in select * from public.payout_items where payout_id = po.id loop
    perform private.post(txn, 'supplier_payable', greatest(it.amount_centavos, 0), greatest(-it.amount_centavos, 0),
      'Payout ' || po.ref, po.supplier_id, it.order_id, p_payout => po.id);
  end loop;
  perform private.post(txn, 'gateway_clearing', 0, po.amount_centavos, 'Payout ' || po.ref, po.supplier_id, p_payout => po.id);
  update public.payouts set status = 'released', released_at = now(), released_by = auth.uid(),
    provider_ref = btrim(coalesce(p_provider_ref, '')) where id = po.id;
  perform private.notify(s.owner_id, 'Payout released', po.ref || ' has been released to you.', '/supplier/payouts')
  from public.suppliers s where s.id = po.supplier_id;
  perform private.audit('payout.release', 'payouts', po.id::text, jsonb_build_object('amount_centavos', po.amount_centavos));
end $$;

-- ---------------------------------------------------------------- supplier: variants and stock

-- Replaces a listing's options: [{"name": "M / Black", "priceDeltaCentavos": 0}]. Options left out are
-- switched off (kept for past orders). Changing an approved listing's options re-opens review.
create function public.set_product_variants(p_product_id uuid, p_variants jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  sid uuid := private.require_verified_supplier();
  cur public.product_status;
  v jsonb;
  i integer := 0;
begin
  select status into cur from public.products where id = p_product_id and supplier_id = sid for update;
  if cur is null then
    raise exception 'Product not found' using errcode = 'P0002';
  end if;
  if jsonb_typeof(coalesce(p_variants, '[]')) <> 'array' or jsonb_array_length(coalesce(p_variants, '[]')) > 50 then
    raise exception 'Up to 50 options' using errcode = '22023';
  end if;
  update public.product_variants set active = false where product_id = p_product_id;
  for v in select * from jsonb_array_elements(coalesce(p_variants, '[]')) loop
    if jsonb_typeof(v -> 'priceDeltaCentavos') not in ('number') or (v ->> 'priceDeltaCentavos') !~ '^-?[0-9]+$' then
      raise exception 'Option prices are whole centavos' using errcode = '22023';
    end if;
    insert into public.product_variants (product_id, name, price_delta_centavos, sort_order, active)
    values (p_product_id, btrim(v ->> 'name'), (v ->> 'priceDeltaCentavos')::bigint, i, true)
    on conflict (product_id, name) do update set price_delta_centavos = excluded.price_delta_centavos,
      sort_order = excluded.sort_order, active = true;
    i := i + 1;
  end loop;
  if cur = 'approved' then
    update public.products set status = 'pending', submitted_at = now() where id = p_product_id;
    insert into public.product_status_history (product_id, from_status, to_status, reason, actor_id)
    values (p_product_id, 'approved', 'pending', 'Options changed by supplier', auth.uid());
  end if;
  perform private.audit('product.variants', 'products', p_product_id::text, jsonb_build_object('count', i));
end $$;

-- Sets the stock on hand (null = stop tracking). Stock changes never need review.
create function public.set_stock(p_product_id uuid, p_variant_id uuid, p_stock integer) returns void
language plpgsql security definer set search_path = '' as $$
declare
  sid uuid := private.require_verified_supplier();
  old integer;
begin
  if not exists (select 1 from public.products where id = p_product_id and supplier_id = sid) then
    raise exception 'Product not found' using errcode = 'P0002';
  end if;
  if p_stock is not null and p_stock < 0 then
    raise exception 'Stock cannot be negative' using errcode = '22023';
  end if;
  if p_variant_id is null then
    select stock into old from public.products where id = p_product_id for update;
    update public.products set stock = p_stock where id = p_product_id;
  else
    select stock into old from public.product_variants where id = p_variant_id and product_id = p_product_id for update;
    if not found then
      raise exception 'Option not found' using errcode = 'P0002';
    end if;
    update public.product_variants set stock = p_stock where id = p_variant_id;
  end if;
  if coalesce(p_stock, 0) <> coalesce(old, 0) then
    insert into public.stock_movements (product_id, variant_id, delta, reason, actor_id)
    values (p_product_id, p_variant_id, coalesce(p_stock, 0) - coalesce(old, 0), 'adjust', auth.uid());
  end if;
end $$;

-- ---------------------------------------------------------------- scheduled jobs

create function private.expire_checkouts() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  c uuid;
  n integer := 0;
begin
  for c in select id from public.checkouts where status = 'pending' and expires_at < now() for update skip locked loop
    perform private.release_checkout(c, 'expired', 'Payment window expired');
    n := n + 1;
  end loop;
  return n;
end $$;

create extension if not exists pg_cron;
select cron.schedule('tulay-expire-checkouts', '* * * * *', 'select private.expire_checkouts()');
select cron.schedule('tulay-schedule-payouts', '0 * * * *', 'select private.schedule_payouts()');

-- ---------------------------------------------------------------- privileges + RLS

revoke all on public.product_variants, public.stock_movements, public.cart_items, public.checkouts, public.orders,
  public.order_items, public.order_status_history, public.stock_reservations, public.payments, public.payment_events,
  public.refunds, public.payouts, public.payout_items, public.ledger_entries
  from anon, authenticated;
grant select on public.product_variants to anon, authenticated;
grant select on public.stock_movements, public.cart_items, public.checkouts, public.orders, public.order_items,
  public.order_status_history, public.stock_reservations, public.payments, public.payment_events, public.refunds,
  public.payouts, public.payout_items, public.ledger_entries
  to authenticated;
grant insert (product_id, variant_id, quantity), update (quantity), delete on public.cart_items to authenticated;

alter table public.product_variants enable row level security;
alter table public.stock_movements enable row level security;
alter table public.cart_items enable row level security;
alter table public.checkouts enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_status_history enable row level security;
alter table public.stock_reservations enable row level security;
alter table public.payments enable row level security;
alter table public.payment_events enable row level security;
alter table public.refunds enable row level security;
alter table public.payouts enable row level security;
alter table public.payout_items enable row level security;
alter table public.ledger_entries enable row level security;

create policy "product_variants: with visible product" on public.product_variants for select to anon, authenticated
  using (exists (select 1 from public.products p where p.id = product_id));
create policy "stock_movements: owner or admin" on public.stock_movements for select to authenticated
  using ((select public.is_admin())
    or exists (select 1 from public.products p where p.id = product_id and p.supplier_id = (select public.my_supplier_id())));

create policy "cart_items: own" on public.cart_items for select to authenticated using (user_id = (select auth.uid()));
create policy "cart_items: add own" on public.cart_items for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.is_active_user()));
create policy "cart_items: change own" on public.cart_items for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "cart_items: remove own" on public.cart_items for delete to authenticated using (user_id = (select auth.uid()));

create policy "checkouts: buyer or finance" on public.checkouts for select to authenticated
  using (buyer_id = (select auth.uid()) or (select public.has_admin_role('finance', 'support')));
create policy "payments: buyer or finance" on public.payments for select to authenticated
  using ((select public.has_admin_role('finance', 'support'))
    or exists (select 1 from public.checkouts c where c.id = checkout_id and c.buyer_id = (select auth.uid())));
create policy "payment_events: finance" on public.payment_events for select to authenticated
  using ((select public.has_admin_role('finance')));

-- Suppliers see an order only once it has been paid.
create policy "orders: buyer, paid supplier or admin" on public.orders for select to authenticated
  using (
    buyer_id = (select auth.uid())
    or (supplier_id = (select public.my_supplier_id()) and paid_at is not null)
    or (select public.has_admin_role('finance', 'support'))
  );
-- A supplier with a paid order sees who the buyer is (contact for the order; delivery address in Stage 5).
create policy "profiles: supplier with a paid order reads the buyer" on public.profiles for select to authenticated
  using (exists (
    select 1 from public.orders o
    where o.buyer_id = profiles.id and o.paid_at is not null and o.supplier_id = (select public.my_supplier_id())
  ));
create policy "order_items: with visible order" on public.order_items for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id));
create policy "order_status_history: with visible order" on public.order_status_history for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id));
create policy "stock_reservations: owner or admin" on public.stock_reservations for select to authenticated
  using ((select public.is_admin())
    or exists (select 1 from public.products p where p.id = product_id and p.supplier_id = (select public.my_supplier_id())));
create policy "refunds: with visible order or finance" on public.refunds for select to authenticated
  using ((select public.has_admin_role('finance'))
    or exists (select 1 from public.orders o where o.id = order_id));
create policy "payouts: supplier or finance" on public.payouts for select to authenticated
  using (supplier_id = (select public.my_supplier_id()) or (select public.has_admin_role('finance')));
create policy "payout_items: with visible payout" on public.payout_items for select to authenticated
  using (exists (select 1 from public.payouts p where p.id = payout_id));
create policy "ledger_entries: own payable lines or finance" on public.ledger_entries for select to authenticated
  using ((select public.has_admin_role('finance'))
    or (account = 'supplier_payable' and supplier_id = (select public.my_supplier_id())));

revoke execute on all functions in schema private from public, anon, authenticated;
revoke execute on function
  public.start_checkout(uuid, public.payment_method),
  public.start_selection_checkout(uuid, uuid, public.payment_method),
  public.attach_payment_session(uuid, text, text),
  public.cancel_order(uuid, text),
  public.confirm_payment(text, text, text, bigint, bigint, jsonb),
  public.fail_payment(text, text, text, jsonb),
  public.complete_refund(uuid, text, boolean),
  public.admin_create_refund(uuid, bigint, text, uuid),
  public.admin_refund_unmatched(uuid, uuid),
  public.admin_release_payout(uuid, text),
  public.set_product_variants(uuid, jsonb),
  public.set_stock(uuid, uuid, integer)
  from public, anon, authenticated;
grant execute on function
  public.start_checkout(uuid, public.payment_method),
  public.start_selection_checkout(uuid, uuid, public.payment_method),
  public.attach_payment_session(uuid, text, text),
  public.cancel_order(uuid, text),
  public.admin_create_refund(uuid, bigint, text, uuid),
  public.admin_refund_unmatched(uuid, uuid),
  public.admin_release_payout(uuid, text),
  public.set_product_variants(uuid, jsonb),
  public.set_stock(uuid, uuid, integer)
  to authenticated;
-- Only the gateway (webhook route / server code with the service key) settles money.
grant execute on function
  public.confirm_payment(text, text, text, bigint, bigint, jsonb),
  public.fail_payment(text, text, text, jsonb),
  public.complete_refund(uuid, text, boolean)
  to service_role;
