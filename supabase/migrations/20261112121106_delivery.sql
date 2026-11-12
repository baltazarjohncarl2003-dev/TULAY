-- Stage 5 Delivery: buyer addresses, shipping fee, cash on delivery (COD) with the custom-item
-- downpayment, artwork and proof approval, production, shipments with courier tracking, and
-- delivery confirmation (which starts the payout clock from Stage 4).
--
-- Fulfilment modes: courier (catalog orders; fake courier until Ninja Van), and for RFQ deals the
-- quoted terms: supplier_delivery, buyer_pickup, freight. Without a courier, the supplier marks the
-- order delivered and the buyer confirms (auto-confirmed after delivery_confirm_days).
--
-- COD: the courier collects the balance and remits it straight to the supplier. TULAY records only
-- the online downpayment (custom items: cod_downpayment_bps of the order) and the remittance report.

alter type public.order_status add value if not exists 'confirmed' after 'paid'; -- COD order accepted, balance due on delivery

insert into public.platform_settings (key, value, description) values
  ('shipping_flat_fee_centavos', '15000', 'Courier fee per order charged to the buyer at checkout (stand-in until Ninja Van rate quotes).'),
  ('delivery_confirm_days', '3', 'Days after a supplier marks a non-courier order delivered before it is confirmed automatically.'),
  ('cod_max_refusals', '2', 'Refused COD deliveries after which a buyer can no longer choose COD.');

create type public.fulfilment_mode as enum ('courier', 'supplier_delivery', 'buyer_pickup', 'freight');
create type public.payment_option as enum ('online', 'cod');
create type public.proof_status as enum ('sent', 'approved', 'changes_requested');
create type public.shipment_status as enum
  ('booked', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'failed_attempt', 'returned');

-- ---------------------------------------------------------------- addresses

create table public.addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  label text not null default '' check (char_length(label) <= 40),
  recipient text not null check (char_length(recipient) between 1 and 100),
  phone text not null check (phone ~ '^09[0-9]{9}$'),
  line1 text not null check (char_length(line1) between 1 and 200),
  line2 text not null default '' check (char_length(line2) <= 200),
  barangay text not null default '' check (char_length(barangay) <= 100),
  city text not null check (char_length(city) between 1 and 100),
  province text not null check (char_length(province) between 1 and 100),
  postal_code text not null default '' check (postal_code = '' or postal_code ~ '^[0-9]{4}$'),
  created_at timestamptz not null default now()
);
create index addresses_user_idx on public.addresses (user_id);

-- ---------------------------------------------------------------- orders: fulfilment and COD fields

alter table public.checkouts drop constraint checkouts_total_centavos_check;
alter table public.checkouts add constraint checkouts_total_centavos_check check (total_centavos >= 0); -- 0 = COD with no downpayment
alter table public.checkouts add column payment_option public.payment_option not null default 'online';

alter table public.orders drop constraint orders_check;
alter table public.orders
  add column shipping_centavos bigint not null default 0 check (shipping_centavos >= 0),
  add column fulfilment_mode public.fulfilment_mode not null default 'courier',
  add column ship_to jsonb, -- frozen copy of the delivery address; null for buyer pickup
  add column payment_option public.payment_option not null default 'online',
  add column downpayment_centavos bigint not null default 0 check (downpayment_centavos >= 0),
  add column paid_online_centavos bigint not null default 0 check (paid_online_centavos >= 0),
  add column proof_approved_at timestamptz,
  add column delivery_claimed_at timestamptz, -- supplier says delivered (non-courier modes)
  add column refused_at timestamptz, -- COD delivery refused at the door
  add constraint orders_total_check check (total_centavos = items_centavos + fees_centavos + shipping_centavos);

-- ---------------------------------------------------------------- custom work: artwork and proofs

-- Files live in the private `order-files` bucket at <order_id>/artwork/<file> and <order_id>/proofs/<file>.
create table public.artwork_files (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id),
  storage_path text not null unique check (storage_path ~ '^[0-9a-f-]{36}/artwork/[A-Za-z0-9._-]{1,200}$' and split_part(storage_path, '/', 1) = order_id::text),
  file_name text not null check (char_length(file_name) between 1 and 200),
  note text not null default '' check (char_length(note) <= 1000),
  uploaded_by uuid not null,
  created_at timestamptz not null default now()
);
create index artwork_files_order_idx on public.artwork_files (order_id);

create table public.proofs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id),
  version integer not null check (version >= 1),
  storage_path text not null unique check (storage_path ~ '^[0-9a-f-]{36}/proofs/[A-Za-z0-9._-]{1,200}$' and split_part(storage_path, '/', 1) = order_id::text),
  note text not null default '' check (char_length(note) <= 1000),
  status public.proof_status not null default 'sent',
  response_note text not null default '' check (char_length(response_note) <= 1000),
  responded_by uuid,
  responded_at timestamptz,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  unique (order_id, version)
);

-- An approved proof is frozen evidence: no change of any kind afterwards.
create function private.freeze_approved_proof() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' or old.status = 'approved' then
    raise exception 'An approved proof is frozen as evidence' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger proofs_frozen before update or delete on public.proofs
  for each row execute function private.freeze_approved_proof();
create trigger artwork_files_append_only before update or delete on public.artwork_files
  for each row execute function private.forbid_change();

-- ---------------------------------------------------------------- shipments and tracking

create table public.shipments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders (id),
  carrier text not null check (carrier in ('fake', 'ninjavan')),
  tracking_ref text not null check (char_length(tracking_ref) between 1 and 100),
  cod_amount_centavos bigint not null default 0 check (cod_amount_centavos >= 0),
  status public.shipment_status not null default 'booked',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (carrier, tracking_ref)
);
create trigger shipments_touch before update on public.shipments
  for each row execute function private.touch_updated_at();

-- Courier webhooks, stored once per event id: a redelivery changes nothing.
create table public.tracking_events (
  id bigint generated always as identity primary key,
  shipment_id uuid not null references public.shipments (id),
  carrier text not null,
  event_id text not null,
  status public.shipment_status not null,
  note text not null default '',
  occurred_at timestamptz not null,
  payload jsonb not null default '{}',
  received_at timestamptz not null default now(),
  unique (carrier, event_id)
);
create index tracking_events_shipment_idx on public.tracking_events (shipment_id, occurred_at);
create trigger tracking_events_append_only before update or delete on public.tracking_events
  for each row execute function private.forbid_change();

-- COD cash the courier collected and remitted to the supplier (reconciliation only; TULAY never holds it).
create table public.cod_remittances (
  id bigint generated always as identity primary key,
  order_id uuid not null unique references public.orders (id),
  amount_centavos bigint not null check (amount_centavos > 0),
  reported_at timestamptz not null default now()
);
create trigger cod_remittances_append_only before update or delete on public.cod_remittances
  for each row execute function private.forbid_change();

-- ---------------------------------------------------------------- money helpers (replace Stage 4 versions)

-- Ledger for money received online for one order (paid P, gateway fee F, commission C):
--   dr gateway_clearing P-F | cr platform_revenue C | supplier_payable takes the difference (P-F-C,
--   a debit when negative: commission owed on a COD order beyond its downpayment is charged later).
create function private.post_order_paid(p_order public.orders, p_paid bigint, p_fee bigint, p_payment uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  txn uuid := gen_random_uuid();
  net bigint := p_paid - p_fee - p_order.commission_centavos;
begin
  perform private.post(txn, 'gateway_clearing', p_paid - p_fee, 0, 'Order paid', p_order.supplier_id, p_order.id, p_payment);
  perform private.post(txn, 'platform_revenue', 0, p_order.commission_centavos, 'Commission', p_order.supplier_id, p_order.id, p_payment);
  perform private.post(txn, 'supplier_payable', greatest(-net, 0), greatest(net, 0),
    case when p_fee > 0 then 'Order paid, less gateway fee' else 'Order paid' end, p_order.supplier_id, p_order.id, p_payment);
end $$;

-- Commission still recognised on an order is given back (cancelled before production, or refused COD).
create function private.reverse_commission(p_order_id uuid, p_memo text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  o public.orders;
  left_c bigint;
  txn uuid := gen_random_uuid();
begin
  select * into o from public.orders where id = p_order_id;
  select coalesce(sum(credit_centavos - debit_centavos), 0) into left_c
  from public.ledger_entries where order_id = p_order_id and account = 'platform_revenue';
  if left_c > 0 then
    perform private.post(txn, 'platform_revenue', left_c, 0, p_memo, o.supplier_id, o.id);
    perform private.post(txn, 'supplier_payable', 0, left_c, p_memo, o.supplier_id, o.id);
  end if;
end $$;

-- Settles a checkout once its online amount is in (or immediately when nothing is due online):
-- online orders -> paid, COD orders -> confirmed; reservations converted; ledger written; cart cleared.
create function private.confirm_checkout(p_checkout_id uuid, p_payment_id uuid, p_fee bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare
  co public.checkouts;
  o public.orders;
  paid bigint;
  share bigint;
  given bigint := 0;
  first_order uuid;
begin
  select * into co from public.checkouts where id = p_checkout_id for update;
  update public.checkouts set status = 'paid' where id = co.id;

  -- Gateway fee split by the amount each order paid online (largest takes the rounding remainder).
  for o in select * from public.orders where checkout_id = co.id order by
    (case when payment_option = 'cod' then downpayment_centavos else total_centavos end) desc, id
  loop
    paid := case when o.payment_option = 'cod' then o.downpayment_centavos else o.total_centavos end;
    share := case when co.total_centavos > 0 then (p_fee * paid) / co.total_centavos else 0 end;
    if first_order is null then
      first_order := o.id;
    end if;
    update public.orders set gateway_fee_centavos = share, paid_online_centavos = paid where id = o.id;
    given := given + share;
  end loop;
  update public.orders set gateway_fee_centavos = gateway_fee_centavos + (p_fee - given) where id = first_order;

  for o in select * from public.orders where checkout_id = co.id loop
    perform private.set_order_status(o.id, case when o.payment_option = 'cod' then 'confirmed' else 'paid' end::public.order_status,
      case when o.payment_option = 'cod' then 'COD order confirmed' else 'Payment confirmed' end);
    update public.orders set paid_at = now() where id = o.id;
    perform private.post_order_paid(o, o.paid_online_centavos, o.gateway_fee_centavos, p_payment_id);
    perform private.notify(s.owner_id, 'New order', o.ref || ' is ready for you.', '/supplier/orders/' || o.id)
    from public.suppliers s where s.id = o.supplier_id;
  end loop;
  update public.stock_reservations set status = 'converted' where checkout_id = co.id and status = 'active';
  delete from public.cart_items c
  where c.user_id = co.buyer_id and exists (
    select 1 from public.order_items i join public.orders x on x.id = i.order_id
    where x.checkout_id = co.id and i.product_id = c.product_id and i.variant_id is not distinct from c.variant_id);
  perform private.notify(co.buyer_id, 'Order confirmed', 'Thank you. Your order is confirmed.', '/buyer/orders');
end $$;

drop function public.start_checkout(uuid, public.payment_method);
drop function public.start_selection_checkout(uuid, uuid, public.payment_method);
drop function private.create_orders(uuid, uuid, jsonb, bigint);

-- Orders for a checkout from lines [{supplierId, productId, variantId, title, variantName, unit, quantity, unitPrice, bps, returnClass}].
-- Returns the amount due online now.
create function private.create_orders(
  p_checkout_id uuid, p_buyer uuid, p_lines jsonb, p_fees bigint, p_shipping bigint,
  p_mode public.fulfilment_mode, p_ship_to jsonb, p_option public.payment_option
) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  sup uuid;
  ord uuid;
  items bigint;
  comm bigint;
  custom boolean;
  total bigint;
  down bigint;
  due bigint := 0;
begin
  for sup in select distinct (l ->> 'supplierId')::uuid from jsonb_array_elements(p_lines) l loop
    select sum((l ->> 'unitPrice')::bigint * (l ->> 'quantity')::integer),
           sum(private.bps_of((l ->> 'unitPrice')::bigint * (l ->> 'quantity')::integer, (l ->> 'bps')::integer)),
           bool_or(l ->> 'returnClass' = 'custom')
    into items, comm, custom
    from jsonb_array_elements(p_lines) l where (l ->> 'supplierId')::uuid = sup;
    total := items + p_fees + p_shipping;
    -- COD: custom-made items need an online downpayment first (admin setting); stock items can be full COD.
    down := case when p_option = 'cod' and custom then private.bps_of(total, private.setting_int('cod_downpayment_bps'))
                 when p_option = 'cod' then 0 else total end;
    insert into public.orders (checkout_id, buyer_id, supplier_id, items_centavos, fees_centavos, shipping_centavos, total_centavos,
      commission_centavos, fulfilment_mode, ship_to, payment_option, downpayment_centavos)
    values (p_checkout_id, p_buyer, sup, items, p_fees, p_shipping, total, comm, p_mode, p_ship_to, p_option,
      case when p_option = 'cod' then down else 0 end)
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
    due := due + down;
  end loop;
  return due;
end $$;

-- Frozen delivery address for an order, or null (buyer pickup). Raises when the address is not the caller's.
create function private.ship_to(p_address_id uuid, p_uid uuid, p_required boolean) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare a public.addresses;
begin
  if p_address_id is null then
    if p_required then
      raise exception 'Choose a delivery address' using errcode = '22023';
    end if;
    return null;
  end if;
  select * into a from public.addresses where id = p_address_id and user_id = p_uid;
  if a.id is null then
    raise exception 'Delivery address not found' using errcode = 'P0002';
  end if;
  return jsonb_build_object('recipient', a.recipient, 'phone', a.phone, 'line1', a.line1, 'line2', a.line2,
    'barangay', a.barangay, 'city', a.city, 'province', a.province, 'postalCode', a.postal_code);
end $$;

-- COD gate: enabled by admin (cod_max_order_centavos > 0), courier only, each order under the cap,
-- and the buyer has not refused cod_max_refusals deliveries.
create function private.check_cod(p_checkout_id uuid, p_uid uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
declare cap bigint := coalesce(private.setting_int('cod_max_order_centavos'), 0);
begin
  if cap <= 0 then
    raise exception 'Cash on delivery is not available yet' using errcode = '22023';
  end if;
  if (select count(*) from public.orders where buyer_id = p_uid and refused_at is not null) >= coalesce(private.setting_int('cod_max_refusals'), 2) then
    raise exception 'Cash on delivery is not available on this account; please pay online' using errcode = '22023';
  end if;
  if exists (select 1 from public.orders where checkout_id = p_checkout_id and total_centavos > cap) then
    raise exception 'Orders above % centavos must be paid online', cap using errcode = '22023';
  end if;
end $$;

-- Finishes a new checkout: payment row when something is due online, else settle at once (all-COD, no downpayment).
create function private.finish_checkout(p_checkout_id uuid, p_method public.payment_method, p_due bigint) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.checkouts set total_centavos = p_due where id = p_checkout_id;
  if p_due > 0 then
    insert into public.payments (checkout_id, method, amount_centavos) values (p_checkout_id, p_method, p_due);
  else
    perform private.confirm_checkout(p_checkout_id, null, 0);
  end if;
end $$;

-- Cart checkout (courier delivery to p_address_id). Returns the amount due online now (0 = COD, nothing to pay yet).
create function public.start_checkout(
  p_idempotency_key uuid, p_method public.payment_method, p_address_id uuid, p_payment_option public.payment_option default 'online'
) returns table (checkout_id uuid, amount_centavos bigint)
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_user();
  co public.checkouts;
  old uuid;
  it record;
  unit bigint;
  lines jsonb := '[]';
  due bigint;
  ship jsonb;
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
  ship := private.ship_to(p_address_id, uid, true);
  for old in select c.id from public.checkouts c where c.buyer_id = uid and c.status = 'pending' and c.selection_id is null for update loop
    perform private.release_checkout(old, 'cancelled', 'Replaced by a new checkout');
  end loop;

  insert into public.checkouts (buyer_id, method, total_centavos, idempotency_key, expires_at, payment_option)
  values (uid, p_method, 0, p_idempotency_key, now() + make_interval(mins => coalesce(private.setting_int('checkout_ttl_minutes'), 15)), p_payment_option)
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

  -- shortcut: flat courier fee per order from admin settings; switch to signed Ninja Van rate quotes after the permit.
  due := private.create_orders(co.id, uid, lines, 0, coalesce(private.setting_int('shipping_flat_fee_centavos'), 0),
    'courier', ship, p_payment_option);
  if p_payment_option = 'cod' then
    perform private.check_cod(co.id, uid);
  end if;
  perform private.finish_checkout(co.id, p_method, due);
  perform private.audit('checkout.start', 'checkouts', co.id::text,
    jsonb_build_object('due_centavos', due, 'method', p_method, 'option', p_payment_option));
  return query select co.id, due;
end $$;

-- RFQ-deal checkout (online only). Delivery follows the quoted terms; the quote already priced delivery.
create function public.start_selection_checkout(
  p_selection_id uuid, p_idempotency_key uuid, p_method public.payment_method, p_address_id uuid
) returns table (checkout_id uuid, amount_centavos bigint)
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
  due bigint;
  mode public.fulfilment_mode;
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
  mode := case q.delivery_terms when 'buyer_pickup' then 'buyer_pickup' when 'third_party_freight' then 'freight'
               else 'supplier_delivery' end;
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
  due := private.create_orders(co.id, uid, jsonb_build_array(jsonb_build_object(
      'supplierId', sel.supplier_id, 'productId', '', 'variantId', '', 'title', r.product, 'variantName', '',
      'unit', r.unit, 'quantity', qty, 'unitPrice', unit, 'bps', public.commission_rate_bps(r.category_id, now()),
      'returnClass', 'custom')),
    sel.amount_centavos - unit * qty, 0, mode, private.ship_to(p_address_id, uid, mode <> 'buyer_pickup'), 'online');
  if due <> sel.amount_centavos then
    raise exception 'Deal amount mismatch' using errcode = 'XX000';
  end if;
  perform private.finish_checkout(co.id, p_method, due);
  perform private.audit('checkout.start', 'checkouts', co.id::text, jsonb_build_object('selection_id', sel.id, 'due_centavos', due));
  return query select co.id, due;
end $$;

-- Gateway confirmation (unchanged contract; settles through confirm_checkout).
create or replace function public.confirm_payment(
  p_provider text, p_event_id text, p_provider_ref text, p_amount_centavos bigint, p_fee_centavos bigint, p_payload jsonb
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  pay public.payments;
  co public.checkouts;
  fee bigint;
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
  perform private.confirm_checkout(co.id, pay.id, fee);
  perform private.audit('payment.paid', 'payments', pay.id::text, jsonb_build_object('fee_centavos', fee, 'event_id', p_event_id));
  return 'paid';
end $$;

-- Refund of money paid online: commission returned in proportion, never more than is still recognised.
create or replace function public.complete_refund(p_refund_id uuid, p_provider_refund_ref text, p_success boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  rf public.refunds;
  o public.orders;
  comm bigint;
  left_c bigint;
  txn uuid := gen_random_uuid();
begin
  select * into rf from public.refunds where id = p_refund_id for update;
  if rf.id is null then
    raise exception 'Refund not found' using errcode = 'P0002';
  end if;
  if rf.status <> 'pending' then
    return;
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
    select coalesce(sum(credit_centavos - debit_centavos), 0) into left_c
    from public.ledger_entries where order_id = o.id and account = 'platform_revenue';
    comm := least(left_c, case when o.paid_online_centavos > 0 then (o.commission_centavos * rf.amount_centavos) / o.paid_online_centavos else 0 end);
    perform private.post(txn, 'supplier_payable', rf.amount_centavos - comm, 0, 'Refund', o.supplier_id, o.id, rf.payment_id, rf.id);
    perform private.post(txn, 'platform_revenue', comm, 0, 'Commission returned', o.supplier_id, o.id, rf.payment_id, rf.id);
    perform private.post(txn, 'gateway_clearing', 0, rf.amount_centavos, 'Refund', o.supplier_id, o.id, rf.payment_id, rf.id);
    perform private.notify(o.buyer_id, 'Refund sent', o.ref || ': your refund is on its way to your original payment method.',
      '/buyer/orders/' || o.id);
  end if;
  perform private.audit('refund.succeeded', 'refunds', rf.id::text, jsonb_build_object('amount_centavos', rf.amount_centavos));
end $$;

-- Refunds are capped at what was paid online (the COD cash went to the supplier, not through TULAY).
create or replace function public.admin_create_refund(p_order_id uuid, p_amount_centavos bigint, p_reason text, p_idempotency_key uuid) returns uuid
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
  refundable := o.paid_online_centavos - coalesce((select sum(amount_centavos) from public.refunds where order_id = o.id and status <> 'failed'), 0);
  if refundable <= 0 then
    raise exception 'Nothing paid online is left to refund on this order' using errcode = '22023';
  end if;
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

-- Buyer: cancel before production starts and before a proof is approved. Refunds what was paid online.
create or replace function public.cancel_order(p_order_id uuid, p_reason text default '') returns uuid
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
  if o.status not in ('paid', 'confirmed') then
    raise exception 'Only orders that are not in production yet can be cancelled' using errcode = '22023';
  end if;
  if o.proof_approved_at is not null then
    raise exception 'Cancellation ends once you approve the proof' using errcode = '22023';
  end if;
  perform private.set_order_status(o.id, 'cancelled', coalesce(nullif(btrim(p_reason), ''), 'Cancelled by the buyer'));
  for res in select * from public.stock_reservations where order_id = o.id and status = 'converted' for update loop
    perform private.return_stock(res);
    update public.stock_reservations set status = 'released' where id = res.id;
  end loop;
  insert into public.refunds (order_id, payment_id, amount_centavos, reason, idempotency_key, requested_by)
  select o.id, p.id, x.left_centavos, 'Order cancelled by the buyer', gen_random_uuid(), uid
  from public.payments p
  cross join lateral (select o.paid_online_centavos - coalesce((select sum(amount_centavos) from public.refunds
      where order_id = o.id and status <> 'failed'), 0) as left_centavos) x
  where p.checkout_id = o.checkout_id and x.left_centavos > 0
  returning id into rid;
  if rid is null then
    perform private.reverse_commission(o.id, 'Commission reversed: cancelled');
  end if;
  perform private.notify(s.owner_id, 'Order cancelled', o.ref || ' was cancelled by the buyer before production.',
    '/supplier/orders/' || o.id)
  from public.suppliers s where s.id = o.supplier_id;
  perform private.audit('order.cancel', 'orders', o.id::text, jsonb_build_object('refund_id', rid));
  return rid;
end $$;

-- ---------------------------------------------------------------- custom work: artwork and proofs

create function private.my_order(p_order_id uuid, p_side text) returns public.orders
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_user();
  o public.orders;
begin
  select * into o from public.orders where id = p_order_id for update;
  if o.id is null
     or (p_side = 'buyer' and o.buyer_id <> uid)
     or (p_side = 'supplier' and not exists (select 1 from public.suppliers s where s.id = o.supplier_id and s.owner_id = uid and s.status = 'verified')) then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;
  return o;
end $$;

create function private.is_custom(p_order_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.order_items where order_id = p_order_id and return_class = 'custom');
$$;

-- Buyer: record artwork already uploaded to order-files/<order_id>/artwork/<file>.
create function public.add_artwork(p_order_id uuid, p_storage_path text, p_file_name text, p_note text default '') returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  o public.orders := private.my_order(p_order_id, 'buyer');
  new_id uuid;
begin
  if o.status not in ('paid', 'confirmed') or o.proof_approved_at is not null then
    raise exception 'Artwork can be added until the proof is approved' using errcode = '22023';
  end if;
  insert into public.artwork_files (order_id, storage_path, file_name, note, uploaded_by)
  values (o.id, p_storage_path, btrim(p_file_name), btrim(coalesce(p_note, '')), auth.uid())
  returning id into new_id;
  perform private.notify(s.owner_id, 'Artwork received', o.ref || ': the buyer added artwork.', '/supplier/orders/' || o.id)
  from public.suppliers s where s.id = o.supplier_id;
  perform private.audit('order.artwork', 'orders', o.id::text, jsonb_build_object('artwork_id', new_id));
  return new_id;
end $$;

-- Supplier: send a proof (next version) already uploaded to order-files/<order_id>/proofs/<file>.
create function public.send_proof(p_order_id uuid, p_storage_path text, p_note text default '') returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  o public.orders := private.my_order(p_order_id, 'supplier');
  new_id uuid;
  v integer;
begin
  if not private.is_custom(o.id) then
    raise exception 'Only custom orders need a proof' using errcode = '22023';
  end if;
  if o.status not in ('paid', 'confirmed') or o.proof_approved_at is not null then
    raise exception 'Proofs can be sent until one is approved' using errcode = '22023';
  end if;
  if exists (select 1 from public.proofs where order_id = o.id and status = 'sent') then
    raise exception 'Wait for the buyer to answer the last proof' using errcode = '22023';
  end if;
  select coalesce(max(version), 0) + 1 into v from public.proofs where order_id = o.id;
  insert into public.proofs (order_id, version, storage_path, note, created_by)
  values (o.id, v, p_storage_path, btrim(coalesce(p_note, '')), auth.uid())
  returning id into new_id;
  perform private.notify(o.buyer_id, 'Proof ready', o.ref || ': proof version ' || v || ' is ready for your approval.', '/buyer/orders/' || o.id);
  perform private.audit('order.proof', 'proofs', new_id::text, jsonb_build_object('order_id', o.id, 'version', v));
  return new_id;
end $$;

-- Buyer: approve (frozen as evidence; cancellation ends) or ask for changes on the latest proof.
create function public.respond_proof(p_proof_id uuid, p_approve boolean, p_note text default '') returns void
language plpgsql security definer set search_path = '' as $$
declare
  pr public.proofs;
  o public.orders;
  v_note text := btrim(coalesce(p_note, ''));
begin
  select * into pr from public.proofs where id = p_proof_id for update;
  if pr.id is null then
    raise exception 'Proof not found' using errcode = 'P0002';
  end if;
  o := private.my_order(pr.order_id, 'buyer');
  if pr.status <> 'sent' then
    raise exception 'This proof was already answered' using errcode = '22023';
  end if;
  if not p_approve and char_length(v_note) < 3 then
    raise exception 'Tell the supplier what to change' using errcode = '22023';
  end if;
  update public.proofs set status = case when p_approve then 'approved' else 'changes_requested' end::public.proof_status,
    response_note = v_note, responded_by = auth.uid(), responded_at = now()
  where id = pr.id;
  if p_approve then
    update public.orders set proof_approved_at = now() where id = o.id;
  end if;
  perform private.notify(s.owner_id, case when p_approve then 'Proof approved' else 'Changes requested' end,
    o.ref || ': ' || case when p_approve then 'the buyer approved the proof. You can start production.' else v_note end,
    '/supplier/orders/' || o.id)
  from public.suppliers s where s.id = o.supplier_id;
  perform private.audit(case when p_approve then 'order.proof_approved' else 'order.proof_changes' end, 'proofs', pr.id::text);
end $$;

-- ---------------------------------------------------------------- production, shipping, delivery

-- Supplier: start production (custom orders need an approved proof).
create function public.start_production(p_order_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare o public.orders := private.my_order(p_order_id, 'supplier');
begin
  if o.status not in ('paid', 'confirmed') then
    raise exception 'Only new orders can go into production' using errcode = '22023';
  end if;
  if private.is_custom(o.id) and o.proof_approved_at is null then
    raise exception 'The buyer must approve a proof first' using errcode = '22023';
  end if;
  perform private.set_order_status(o.id, 'in_production', 'Production started');
  perform private.notify(o.buyer_id, 'In production', o.ref || ' is now in production.', '/buyer/orders/' || o.id);
end $$;

-- Ready to hand over: custom orders after production; stock orders straight from paid / confirmed.
create function private.check_ready(o public.orders) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (o.status = 'in_production' or (o.status in ('paid', 'confirmed') and not private.is_custom(o.id))) then
    raise exception 'This order is not ready to ship' using errcode = '22023';
  end if;
end $$;

-- Supplier: record the courier booking the server made (courier mode). COD amount = the unpaid balance.
create function public.record_shipment(p_order_id uuid, p_carrier text, p_tracking_ref text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  o public.orders := private.my_order(p_order_id, 'supplier');
  sid uuid;
begin
  if o.fulfilment_mode <> 'courier' then
    raise exception 'This order is not delivered by courier' using errcode = '22023';
  end if;
  perform private.check_ready(o);
  insert into public.shipments (order_id, carrier, tracking_ref, cod_amount_centavos)
  values (o.id, p_carrier, btrim(p_tracking_ref),
    case when o.payment_option = 'cod' then o.total_centavos - o.paid_online_centavos else 0 end)
  returning id into sid;
  perform private.audit('order.shipment', 'shipments', sid::text, jsonb_build_object('order_id', o.id, 'carrier', p_carrier));
  return sid;
end $$;

-- Supplier, non-courier modes: handed over (own delivery / freight) or ready for pickup.
create function public.mark_shipped(p_order_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare o public.orders := private.my_order(p_order_id, 'supplier');
begin
  if o.fulfilment_mode = 'courier' then
    raise exception 'Courier orders move with tracking updates' using errcode = '22023';
  end if;
  perform private.check_ready(o);
  perform private.set_order_status(o.id, 'shipped',
    case when o.fulfilment_mode = 'buyer_pickup' then 'Ready for pickup' else 'On the way' end);
  perform private.notify(o.buyer_id, case when o.fulfilment_mode = 'buyer_pickup' then 'Ready for pickup' else 'On the way' end,
    o.ref, '/buyer/orders/' || o.id);
end $$;

-- Supplier, non-courier modes: says it was delivered / picked up; the buyer confirms (or it auto-confirms).
create function public.mark_delivered(p_order_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare o public.orders := private.my_order(p_order_id, 'supplier');
begin
  if o.fulfilment_mode = 'courier' or o.status <> 'shipped' then
    raise exception 'Only handed-over non-courier orders can be marked delivered' using errcode = '22023';
  end if;
  update public.orders set delivery_claimed_at = coalesce(delivery_claimed_at, now()) where id = o.id;
  perform private.notify(o.buyer_id, 'Please confirm delivery',
    o.ref || ': the supplier says it was delivered. Confirm, or it is confirmed automatically in '
      || coalesce(private.setting_int('delivery_confirm_days'), 3) || ' days.', '/buyer/orders/' || o.id);
end $$;

create function private.deliver(p_order_id uuid, p_at timestamptz, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.set_order_status(p_order_id, 'delivered', p_reason);
  update public.orders set delivered_at = p_at where id = p_order_id;
end $$;

-- Buyer: confirm a non-courier delivery (starts the payout clock).
create function public.confirm_delivery(p_order_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare o public.orders := private.my_order(p_order_id, 'buyer');
begin
  if o.status <> 'shipped' or o.fulfilment_mode = 'courier' then
    raise exception 'This order cannot be confirmed here' using errcode = '22023';
  end if;
  perform private.deliver(o.id, now(), 'Delivery confirmed by the buyer');
end $$;

create function private.auto_confirm_deliveries() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  o uuid;
  n integer := 0;
begin
  for o in select id from public.orders
    where status = 'shipped' and fulfilment_mode <> 'courier' and delivery_claimed_at is not null
      and delivery_claimed_at < now() - make_interval(days => coalesce(private.setting_int('delivery_confirm_days'), 3))
  loop
    perform private.deliver(o, now(), 'Delivery confirmed automatically');
    n := n + 1;
  end loop;
  return n;
end $$;

-- Courier webhook (service_role only; signature verified by the route). Returns: recorded | duplicate | unknown.
create function public.record_tracking_event(
  p_carrier text, p_event_id text, p_tracking_ref text, p_status public.shipment_status, p_occurred_at timestamptz,
  p_note text, p_cod_collected_centavos bigint, p_payload jsonb
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  sh public.shipments;
  o public.orders;
begin
  select * into sh from public.shipments where carrier = p_carrier and tracking_ref = p_tracking_ref for update;
  if sh.id is null then
    perform private.audit('tracking.unknown', 'shipments', p_tracking_ref, jsonb_build_object('event_id', p_event_id));
    return 'unknown';
  end if;
  insert into public.tracking_events (shipment_id, carrier, event_id, status, note, occurred_at, payload)
  values (sh.id, p_carrier, p_event_id, p_status, left(coalesce(p_note, ''), 500), coalesce(p_occurred_at, now()), coalesce(p_payload, '{}'))
  on conflict do nothing;
  if not found then
    return 'duplicate';
  end if;
  update public.shipments set status = p_status where id = sh.id;
  select * into o from public.orders where id = sh.order_id for update;

  if p_status in ('picked_up', 'in_transit', 'out_for_delivery') and o.status in ('paid', 'confirmed', 'in_production') then
    perform private.set_order_status(o.id, 'shipped', 'Picked up by the courier');
    perform private.notify(o.buyer_id, 'On the way', o.ref || ' was picked up by the courier.', '/buyer/orders/' || o.id);
  elsif p_status = 'delivered' and o.status not in ('delivered', 'completed', 'cancelled') then
    perform private.deliver(o.id, coalesce(p_occurred_at, now()), 'Delivered by the courier');
    if coalesce(p_cod_collected_centavos, 0) > 0 then
      insert into public.cod_remittances (order_id, amount_centavos) values (o.id, p_cod_collected_centavos) on conflict do nothing;
    end if;
    perform private.notify(o.buyer_id, 'Delivered', o.ref || ' was delivered.', '/buyer/orders/' || o.id);
  elsif p_status = 'returned' and o.status not in ('delivered', 'completed', 'cancelled') then
    -- Refused or undeliverable: no refund of a COD downpayment (custom goods cannot be resold); commission reversed.
    perform private.set_order_status(o.id, 'cancelled', 'Returned to the supplier: ' || coalesce(nullif(p_note, ''), 'delivery failed'));
    if o.payment_option = 'cod' then
      update public.orders set refused_at = now() where id = o.id;
    end if;
    perform private.reverse_commission(o.id, 'Commission reversed: returned');
    perform private.notify(s.owner_id, 'Parcel returned', o.ref || ' is coming back to you.', '/supplier/orders/' || o.id)
    from public.suppliers s where s.id = o.supplier_id;
    perform private.notify_support('Parcel returned', o.ref || ' was returned to the supplier.', '/admin/shipments');
  end if;
  return 'recorded';
end $$;

select cron.schedule('tulay-auto-confirm-deliveries', '15 * * * *', 'select private.auto_confirm_deliveries()');

-- ---------------------------------------------------------------- storage: order files (private)

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('order-files', 'order-files', false, 20971520, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);

-- Buyers upload artwork, suppliers upload proofs, each only into their own order's folder; both can read.
create policy "order-files: buyer uploads artwork" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'order-files' and (storage.foldername(name))[2] = 'artwork' and (select public.is_active_user())
    and exists (select 1 from public.orders o where o.id::text = (storage.foldername(name))[1] and o.buyer_id = (select auth.uid()))
  );
create policy "order-files: supplier uploads proofs" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'order-files' and (storage.foldername(name))[2] = 'proofs' and (select public.is_active_user())
    and exists (select 1 from public.orders o where o.id::text = (storage.foldername(name))[1]
                and o.paid_at is not null and o.supplier_id = (select public.my_supplier_id()))
  );
create policy "order-files: order parties and support read" on storage.objects for select to authenticated
  using (
    bucket_id = 'order-files' and (
      (select public.has_admin_role('support'))
      or exists (select 1 from public.orders o where o.id::text = (storage.foldername(name))[1]
                 and (o.buyer_id = (select auth.uid()) or (o.paid_at is not null and o.supplier_id = (select public.my_supplier_id()))))
    )
  );

-- ---------------------------------------------------------------- privileges + RLS

revoke all on public.addresses, public.artwork_files, public.proofs, public.shipments, public.tracking_events, public.cod_remittances
  from anon, authenticated;
grant select, delete on public.addresses to authenticated;
grant insert (label, recipient, phone, line1, line2, barangay, city, province, postal_code),
  update (label, recipient, phone, line1, line2, barangay, city, province, postal_code) on public.addresses to authenticated;
grant select on public.artwork_files, public.proofs, public.shipments, public.tracking_events, public.cod_remittances to authenticated;

alter table public.addresses enable row level security;
alter table public.artwork_files enable row level security;
alter table public.proofs enable row level security;
alter table public.shipments enable row level security;
alter table public.tracking_events enable row level security;
alter table public.cod_remittances enable row level security;

create policy "addresses: own" on public.addresses for select to authenticated using (user_id = (select auth.uid()));
create policy "addresses: add own" on public.addresses for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.is_active_user()));
create policy "addresses: edit own" on public.addresses for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "addresses: remove own" on public.addresses for delete to authenticated using (user_id = (select auth.uid()));

-- Order-scoped rows follow the orders policies (buyer, paid supplier, finance/support).
create policy "artwork_files: with visible order" on public.artwork_files for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id));
create policy "proofs: with visible order" on public.proofs for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id));
create policy "shipments: with visible order" on public.shipments for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id));
create policy "tracking_events: with visible shipment" on public.tracking_events for select to authenticated
  using (exists (select 1 from public.shipments s where s.id = shipment_id));
create policy "cod_remittances: with visible order" on public.cod_remittances for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id));

revoke execute on all functions in schema private from public, anon, authenticated;
revoke execute on function
  public.start_checkout(uuid, public.payment_method, uuid, public.payment_option),
  public.start_selection_checkout(uuid, uuid, public.payment_method, uuid),
  public.add_artwork(uuid, text, text, text),
  public.send_proof(uuid, text, text),
  public.respond_proof(uuid, boolean, text),
  public.start_production(uuid),
  public.record_shipment(uuid, text, text),
  public.mark_shipped(uuid),
  public.mark_delivered(uuid),
  public.confirm_delivery(uuid),
  public.record_tracking_event(text, text, text, public.shipment_status, timestamptz, text, bigint, jsonb)
  from public, anon, authenticated;
grant execute on function
  public.start_checkout(uuid, public.payment_method, uuid, public.payment_option),
  public.start_selection_checkout(uuid, uuid, public.payment_method, uuid),
  public.add_artwork(uuid, text, text, text),
  public.send_proof(uuid, text, text),
  public.respond_proof(uuid, boolean, text),
  public.start_production(uuid),
  public.record_shipment(uuid, text, text),
  public.mark_shipped(uuid),
  public.mark_delivered(uuid),
  public.confirm_delivery(uuid)
  to authenticated;
-- Only the courier (webhook route with the service key) reports tracking.
grant execute on function public.record_tracking_event(text, text, text, public.shipment_status, timestamptz, text, bigint, jsonb)
  to service_role;
