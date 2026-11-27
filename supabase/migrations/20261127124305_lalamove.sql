-- Owner decision 2026-11-27: Lalamove replaces Ninja Van as the courier TULAY books on its own account.
--  * Live Lalamove quote at checkout (courier_quotes); the buyer pays it and it is frozen on the order.
--  * The parcel is quoted again at booking: price up = the buyer pays the difference (delivery top-up checkout)
--    before the supplier can book; price down = the buyer is refunded the difference right after booking.
--  * "One ACTIVE shipment per order": a booking the courier ended before pickup is voided (ledger reversed once)
--    and the order can be booked again.
--  * Coordinates on addresses and the supplier pickup, and the supplier's default vehicle (Lalamove service type).
-- Shipments.carrier already allows 'lalamove' (20261116120000_logistics_manual_and_zones.sql).

-- ---------------------------------------------------------------- shipments: one active booking per order

alter table public.shipments drop constraint shipments_order_id_key;
alter table public.shipments
  add column price_centavos bigint check (price_centavos >= 0), -- what the courier booked (B)
  add column share_link text check (char_length(share_link) <= 500),
  add column voided_at timestamptz,
  add column void_reason text not null default '' check (char_length(void_reason) <= 500);
create unique index shipments_order_active on public.shipments (order_id) where voided_at is null;

-- ---------------------------------------------------------------- coordinates and vehicle

alter table public.addresses
  add column lat numeric(9,6),
  add column lng numeric(9,6),
  add constraint addresses_coords_pair check ((lat is null) = (lng is null)),
  add constraint addresses_coords_ph check (lat is null or (lat between 4 and 22 and lng between 116 and 127));
-- Column grants (the table has no blanket insert/update): the buyer writes the pin with the rest of the address.
grant insert (lat, lng), update (lat, lng) on public.addresses to authenticated;

alter table public.supplier_pickup_settings
  add column lat numeric(9,6),
  add column lng numeric(9,6),
  add column lalamove_service_type text check (lalamove_service_type ~ '^[A-Z0-9_]{1,40}$'),
  add constraint supplier_pickup_coords_pair check ((lat is null) = (lng is null)),
  add constraint supplier_pickup_coords_ph check (lat is null or (lat between 4 and 22 and lng between 116 and 127));

-- ---------------------------------------------------------------- quotes, order and checkout columns

create table public.courier_quotes (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references public.profiles (id),
  supplier_id uuid not null references public.suppliers (id),
  address_id uuid not null references public.addresses (id) on delete cascade,
  carrier text not null check (carrier in ('lalamove', 'fake')),
  service_type text not null default '',
  amount_centavos bigint not null check (amount_centavos between 1 and 10000000),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index courier_quotes_buyer_idx on public.courier_quotes (buyer_id, created_at desc);

alter table public.orders
  -- on delete set null (spec has none): deleting an address cascades to its quotes and must not be blocked by an order.
  add column shipping_quote_id uuid references public.courier_quotes (id) on delete set null,
  add column shipping_due_centavos bigint not null default 0 check (shipping_due_centavos >= 0),
  add column courier_booking_claimed_at timestamptz;
alter table public.checkouts add column shipping_topup boolean not null default false;
alter table public.refunds add column shipping_adjustment boolean not null default false;

insert into public.platform_settings (key, value, description) values
  ('courier_quote_ttl_minutes', '15', 'Minutes a live delivery price shown at checkout stays valid. The parcel is priced again at booking and the buyer pays or is refunded the difference.'),
  ('courier_topup_min_centavos', '2000', 'Smallest delivery price difference a buyer is asked to pay. A smaller rise is absorbed by the supplier so a few pesos never block a booking. Confirm against PayMongo''s minimum charge.');

-- ---------------------------------------------------------------- helpers

-- What the buyer still has paid for delivery: shipping paid minus excess already refunded.
create function private.shipping_held(o public.orders) returns bigint
language sql stable security definer set search_path = '' as $$
  select o.shipping_centavos - coalesce((select sum(r.amount_centavos) from public.refunds r
    where r.order_id = o.id and r.shipping_adjustment and r.status <> 'failed'), 0)::bigint;
$$;

-- Frozen delivery address snapshot (now with the pin).
create or replace function private.ship_to(p_address_id uuid, p_uid uuid, p_required boolean) returns jsonb
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
    'barangay', a.barangay, 'city', a.city, 'province', a.province, 'postalCode', a.postal_code,
    'lat', a.lat, 'lng', a.lng);
end $$;

-- ---------------------------------------------------------------- pickup settings (new signature)

drop function public.set_pickup_settings(text, text, text, text, text, text, text, text, integer);
create function public.set_pickup_settings(
  p_sender_name text, p_phone text, p_line1 text, p_line2 text, p_barangay text, p_city text, p_province text,
  p_postal_code text, p_parcel_weight_grams integer,
  p_lat numeric default null, p_lng numeric default null, p_service_type text default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare sid uuid := private.my_verified_supplier();
begin
  -- A lone coordinate, swapped values or a point outside the Philippines fail the table checks (23514).
  insert into public.supplier_pickup_settings
    (supplier_id, sender_name, phone, line1, line2, barangay, city, province, postal_code, parcel_weight_grams,
     lat, lng, lalamove_service_type)
  values (sid, btrim(p_sender_name), btrim(p_phone), btrim(p_line1), btrim(coalesce(p_line2, '')), btrim(coalesce(p_barangay, '')),
    btrim(p_city), btrim(p_province), btrim(coalesce(p_postal_code, '')), p_parcel_weight_grams,
    p_lat, p_lng, nullif(btrim(p_service_type), ''))
  on conflict (supplier_id) do update set
    sender_name = excluded.sender_name, phone = excluded.phone, line1 = excluded.line1, line2 = excluded.line2,
    barangay = excluded.barangay, city = excluded.city, province = excluded.province,
    postal_code = excluded.postal_code, parcel_weight_grams = excluded.parcel_weight_grams,
    lat = excluded.lat, lng = excluded.lng, lalamove_service_type = excluded.lalamove_service_type;
end $$;

-- ---------------------------------------------------------------- quotes at checkout

-- Server only: stores a live courier price for one buyer address and one supplier.
create function public.save_courier_quote(
  p_buyer uuid, p_supplier uuid, p_address uuid, p_carrier text, p_service_type text, p_amount_centavos bigint
) returns table (id uuid, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  qid uuid;
  qexp timestamptz;
begin
  if not exists (select 1 from public.addresses a where a.id = p_address and a.user_id = p_buyer) then
    raise exception 'Delivery address not found' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.suppliers s where s.id = p_supplier and s.status = 'verified') then
    raise exception 'This supplier cannot take orders right now' using errcode = '22023';
  end if;
  insert into public.courier_quotes as q (buyer_id, supplier_id, address_id, carrier, service_type, amount_centavos, expires_at)
  values (p_buyer, p_supplier, p_address, p_carrier, coalesce(p_service_type, ''), p_amount_centavos,
    now() + make_interval(mins => coalesce(private.setting_int('courier_quote_ttl_minutes'), 15)))
  returning q.id, q.expires_at into qid, qexp;
  return query select qid, qexp;
end $$;

-- Orders for a checkout. New: p_quotes = { "<supplier_id>": { "id": "<quote uuid>", "amount": <centavos> } }; a supplier
-- with an entry is charged that live price (and the quote is remembered); others keep the zone fee / p_shipping logic.
drop function private.create_orders(uuid, uuid, jsonb, bigint, bigint, public.fulfilment_mode, jsonb, public.payment_option);
create function private.create_orders(
  p_checkout_id uuid, p_buyer uuid, p_lines jsonb, p_fees bigint, p_shipping bigint,
  p_mode public.fulfilment_mode, p_ship_to jsonb, p_option public.payment_option, p_quotes jsonb default '{}'
) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  sup uuid;
  ord uuid;
  items bigint;
  comm bigint;
  custom boolean;
  ship bigint;
  total bigint;
  down bigint;
  due bigint := 0;
  quote jsonb;
begin
  for sup in select distinct (l ->> 'supplierId')::uuid from jsonb_array_elements(p_lines) l loop
    select sum((l ->> 'unitPrice')::bigint * (l ->> 'quantity')::integer),
           sum(private.bps_of((l ->> 'unitPrice')::bigint * (l ->> 'quantity')::integer, (l ->> 'bps')::integer)),
           bool_or(l ->> 'returnClass' = 'custom')
    into items, comm, custom
    from jsonb_array_elements(p_lines) l where (l ->> 'supplierId')::uuid = sup;
    quote := coalesce(p_quotes, '{}'::jsonb) -> sup::text;
    ship := case when quote is not null then (quote ->> 'amount')::bigint
                 else coalesce(p_shipping, private.shipping_fee(sup, p_ship_to)) end;
    total := items + p_fees + ship;
    -- COD: custom-made items need an online downpayment first (admin setting); stock items can be full COD.
    down := case when p_option = 'cod' and custom then private.bps_of(total, private.setting_int('cod_downpayment_bps'))
                 when p_option = 'cod' then 0 else total end;
    insert into public.orders (checkout_id, buyer_id, supplier_id, items_centavos, fees_centavos, shipping_centavos, total_centavos,
      commission_centavos, fulfilment_mode, ship_to, payment_option, downpayment_centavos, shipping_quote_id)
    values (p_checkout_id, p_buyer, sup, items, p_fees, ship, total, comm, p_mode, p_ship_to, p_option,
      case when p_option = 'cod' then down else 0 end, nullif(quote ->> 'id', '')::uuid)
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

drop function public.start_checkout(uuid, public.payment_method, uuid, public.payment_option);
create function public.start_checkout(
  p_idempotency_key uuid, p_method public.payment_method, p_address_id uuid, p_payment_option public.payment_option default 'online',
  p_quote_ids uuid[] default '{}'
) returns table (checkout_id uuid, amount_centavos bigint)
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_user();
  co public.checkouts;
  old uuid;
  open_until timestamptz;
  it record;
  unit bigint;
  lines jsonb := '[]';
  due bigint;
  ship jsonb;
  quotes jsonb := '{}';
  qid uuid;
  q public.courier_quotes;
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
  -- A checkout whose gateway page is already open may be getting paid right now: do not cancel it.
  select c.expires_at into open_until from public.checkouts c join public.payments p on p.checkout_id = c.id
  where c.buyer_id = uid and c.status = 'pending' and c.selection_id is null and p.provider_ref is not null
  order by c.expires_at desc limit 1;
  if open_until is not null then
    raise exception 'You have a payment in progress. Finish it on the payment page, or try again after %.',
      to_char(open_until at time zone 'Asia/Manila', 'HH12:MI AM') using errcode = '22023';
  end if;
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

  -- Live delivery prices: the caller's own, for this address, unexpired, one per supplier that is in the cart.
  foreach qid in array coalesce(p_quote_ids, '{}') loop
    select * into q from public.courier_quotes x where x.id = qid and x.buyer_id = uid and x.address_id = p_address_id;
    if q.id is null
       or not exists (select 1 from jsonb_array_elements(lines) l where (l ->> 'supplierId')::uuid = q.supplier_id)
       or quotes ->> q.supplier_id::text is not null then
      raise exception 'Delivery price not found' using errcode = 'P0002';
    end if;
    if q.expires_at <= now() then
      raise exception 'The delivery price expired. Refresh it and try again.' using errcode = '22023';
    end if;
    quotes := quotes || jsonb_build_object(q.supplier_id::text, jsonb_build_object('id', q.id, 'amount', q.amount_centavos));
  end loop;

  -- Suppliers without a quote: the zone fee for the address (flat fee when none).
  due := private.create_orders(co.id, uid, lines, 0, null, 'courier', ship, p_payment_option, quotes);
  if p_payment_option = 'cod' then
    perform private.check_cod(co.id, uid);
  end if;
  perform private.finish_checkout(co.id, p_method, due);
  perform private.audit('checkout.start', 'checkouts', co.id::text,
    jsonb_build_object('due_centavos', due, 'method', p_method, 'option', p_payment_option, 'quotes', quotes));
  return query select co.id, due;
end $$;

-- ---------------------------------------------------------------- booking: top-up or book

-- Supplier-side check before the courier is called (the booking costs money). Now also: no booking in progress,
-- nothing owed by the buyer, and a voided booking does not count as "already booked".
create or replace function public.check_can_book_shipment(p_order_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare o public.orders := private.my_order(p_order_id, 'supplier');
begin
  if o.fulfilment_mode <> 'courier' then
    raise exception 'This order is not delivered by courier' using errcode = '22023';
  end if;
  perform private.check_ready(o);
  if exists (select 1 from public.shipments where order_id = o.id and voided_at is null) then
    raise exception 'A courier is already booked for this order' using errcode = '22023';
  end if;
  if o.courier_booking_claimed_at is not null then
    raise exception 'A booking is already in progress for this order. TULAY support will check it.' using errcode = '22023';
  end if;
end $$;

-- Service role: called with the live quote Q right before the courier booking. Quote above what the buyer paid
-- for delivery: record what is owed and tell the buyer. Otherwise claim the booking (the caller books exactly once).
create function public.begin_courier_booking(p_order_id uuid, p_quote_centavos bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  o public.orders;
  held bigint;
  x uuid;
begin
  select * into o from public.orders where id = p_order_id for update;
  if o.id is null then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;
  if o.fulfilment_mode <> 'courier' then
    raise exception 'This order is not delivered by courier' using errcode = '22023';
  end if;
  -- Lalamove does not collect COD here, and shipping_held would count unpaid shipping as paid.
  if o.payment_option = 'cod' then
    raise exception 'Cash on delivery orders cannot be booked on Lalamove yet. Ship with your own courier.' using errcode = '22023';
  end if;
  perform private.check_ready(o);
  if exists (select 1 from public.shipments where order_id = o.id and voided_at is null) then
    raise exception 'A courier is already booked for this order' using errcode = '22023';
  end if;
  if o.courier_booking_claimed_at is not null then
    raise exception 'A booking is already in progress for this order' using errcode = '22023';
  end if;
  if p_quote_centavos is null or p_quote_centavos <= 0 then
    raise exception 'Invalid delivery price' using errcode = '22023';
  end if;
  held := private.shipping_held(o);
  -- Whatever was owed before is stale: close an open top-up payment so the buyer pays only the current difference
  -- (and a late payment for it goes to review, not onto the order).
  for x in select id from public.checkouts where order_id = o.id and shipping_topup and status = 'pending' for update loop
    perform private.release_checkout(x, 'cancelled', 'Delivery price no longer owed');
  end loop;
  if p_quote_centavos - held >= greatest(coalesce(private.setting_int('courier_topup_min_centavos'), 0), 1) then -- a smaller rise is absorbed by the supplier
    update public.orders set shipping_due_centavos = p_quote_centavos - held where id = o.id;
    perform private.notify(o.buyer_id, 'Delivery price changed', o.ref || ': delivery now costs ' || private.php(p_quote_centavos)
      || '. Please pay the ' || private.php(p_quote_centavos - held) || ' difference so the supplier can book the pickup.',
      '/buyer/orders/' || o.id);
    perform private.audit('order.shipping_topup_due', 'orders', o.id::text,
      jsonb_build_object('quote_centavos', p_quote_centavos, 'held_centavos', held, 'due_centavos', p_quote_centavos - held));
    return jsonb_build_object('action', 'topup', 'due_centavos', p_quote_centavos - held);
  end if;
  update public.orders set courier_booking_claimed_at = now(), shipping_due_centavos = 0 where id = o.id;
  return jsonb_build_object('action', 'book', 'held_centavos', held);
end $$;

-- Service role: the courier definitely did not book, so the claim is let go.
create function public.release_courier_booking(p_order_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.orders set courier_booking_claimed_at = null where id = p_order_id;
  perform private.audit('order.booking_released', 'orders', p_order_id::text, jsonb_build_object('reason', left(coalesce(p_reason, ''), 500)));
end $$;

-- Support: after checking the courier dashboard, a stuck claim is cleared by hand.
create function public.admin_release_courier_booking(p_order_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_admin_role('support') then
    raise exception 'Support role with MFA required' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Say why the booking is released' using errcode = '22023';
  end if;
  update public.orders set courier_booking_claimed_at = null where id = p_order_id;
  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;
  perform private.audit('order.booking_released', 'orders', p_order_id::text,
    jsonb_build_object('reason', left(btrim(p_reason), 500), 'by_support', true));
end $$;

-- Service role: something about a courier booking needs a person. Unknown ref = audit only.
create function public.flag_courier_issue(p_carrier text, p_tracking_ref text, p_order_id uuid, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare oref uuid := p_order_id;
begin
  if oref is null then
    select s.order_id into oref from public.shipments s
    where s.carrier = p_carrier and s.tracking_ref = p_tracking_ref and not s.manual and s.voided_at is null;
  end if;
  if oref is null then
    perform private.audit('courier.issue_unknown', 'shipments', coalesce(p_tracking_ref, ''),
      jsonb_build_object('carrier', p_carrier, 'note', left(coalesce(p_note, ''), 500)));
    return;
  end if;
  perform private.notify_admins(array['support']::public.admin_sub_role[], 'Courier needs a check',
    left(coalesce(p_note, ''), 500), '/admin/orders/' || oref);
  perform private.audit('courier.issue', 'orders', oref::text,
    jsonb_build_object('carrier', p_carrier, 'tracking_ref', p_tracking_ref, 'note', left(coalesce(p_note, ''), 500)));
end $$;

-- ---------------------------------------------------------------- recording the booking

-- Server only, after the courier accepted the booking. TULAY pays the courier, so the booked price B (not the fee the
-- buyer paid) moves from the supplier to courier_payable. B defaults to the shipping fee for couriers without quotes.
drop function public.record_shipment(uuid, text, text);
create function public.record_shipment(
  p_order_id uuid, p_carrier text, p_tracking_ref text, p_price_centavos bigint default null, p_share_link text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  o public.orders;
  sid uuid;
  price bigint;
  txn uuid := gen_random_uuid();
begin
  select * into o from public.orders where id = p_order_id for update;
  if o.id is null then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;
  if o.fulfilment_mode <> 'courier' then
    raise exception 'This order is not delivered by courier' using errcode = '22023';
  end if;
  perform private.check_ready(o);
  if o.shipping_due_centavos > 0 then
    raise exception 'The buyer still owes % for delivery', private.php(o.shipping_due_centavos) using errcode = '22023';
  end if;
  price := coalesce(p_price_centavos, o.shipping_centavos);
  insert into public.shipments (order_id, carrier, tracking_ref, cod_amount_centavos, price_centavos, share_link)
  values (o.id, p_carrier, btrim(p_tracking_ref),
    case when o.payment_option = 'cod' then o.total_centavos - o.paid_online_centavos else 0 end,
    price, nullif(btrim(coalesce(p_share_link, '')), ''))
  returning id into sid;
  update public.orders set courier_booking_claimed_at = null where id = o.id;
  if price - private.shipping_held(o) >= greatest(coalesce(private.setting_int('courier_topup_min_centavos'), 0), 1) then -- a gap below the minimum is expected, not an incident
    perform public.flag_courier_issue(p_carrier, btrim(p_tracking_ref), o.id, 'Booked at ' || private.php(price)
      || ', above what the buyer paid for delivery (' || private.php(private.shipping_held(o))
      || '). The supplier absorbs the gap unless support sorts it out.');
  end if;
  perform private.post(txn, 'supplier_payable', price, 0, 'Shipping to TULAY courier (booked)', o.supplier_id, o.id);
  perform private.post(txn, 'courier_payable', 0, price, 'Shipping to TULAY courier (booked)', o.supplier_id, o.id);
  perform private.audit('order.shipment', 'shipments', sid::text,
    jsonb_build_object('order_id', o.id, 'carrier', p_carrier, 'price_centavos', price, 'shipping_centavos', o.shipping_centavos));
  return sid;
end $$;

-- Service role: the buyer paid more for delivery than the courier booked. Refund the difference (held - price).
-- Returns the refund id (send it with settleRefund), or null when nothing is owed back.
create function public.refund_shipping_excess(p_order_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  o public.orders;
  sh public.shipments;
  excess bigint;
  rid uuid;
begin
  select * into o from public.orders where id = p_order_id for update;
  if o.id is null then
    return null;
  end if;
  select * into sh from public.shipments where order_id = o.id and voided_at is null and not manual;
  if sh.id is null or sh.price_centavos is null then
    return null;
  end if;
  excess := private.shipping_held(o) - sh.price_centavos;
  if excess <= 0 then
    return null;
  end if;
  insert into public.refunds (order_id, payment_id, amount_centavos, reason, idempotency_key, shipping_adjustment)
  select o.id, p.id, excess, 'Delivery cost less than paid: difference refunded', gen_random_uuid(), true
  from public.payments p where p.checkout_id = o.checkout_id
  returning id into rid;
  if rid is null then
    return null;
  end if;
  perform private.notify(o.buyer_id, 'Delivery cost refunded', o.ref || ': delivery cost ' || private.php(excess)
    || ' less than you paid. The difference is being refunded.', '/buyer/orders/' || o.id);
  perform private.audit('order.shipping_excess_refund', 'refunds', rid::text,
    jsonb_build_object('order_id', o.id, 'excess_centavos', excess));
  return rid;
end $$;

-- Same as before (20261115115828_audit_fixes_2.sql); a delivery-cost adjustment gives back no commission.
create or replace function public.complete_refund(p_refund_id uuid, p_provider_refund_ref text, p_success boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  rf public.refunds;
  o public.orders;
  comm bigint;
  left_c bigint;
  cl uuid;
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
    perform private.notify_admins(array['finance']::public.admin_sub_role[], 'Refund failed',
      'The gateway refused a refund of ' || private.php(rf.amount_centavos) || '. Send it again from Payments.', '/admin/payments');
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
    comm := case when rf.shipping_adjustment then 0
      else least(left_c, case when o.paid_online_centavos > 0 then (o.commission_centavos * rf.amount_centavos) / o.paid_online_centavos else 0 end) end;
    perform private.post(txn, 'supplier_payable', rf.amount_centavos - comm, 0, 'Refund', o.supplier_id, o.id, rf.payment_id, rf.id);
    perform private.post(txn, 'platform_revenue', comm, 0, 'Commission returned', o.supplier_id, o.id, rf.payment_id, rf.id);
    perform private.post(txn, 'gateway_clearing', 0, rf.amount_centavos, 'Refund', o.supplier_id, o.id, rf.payment_id, rf.id);
    perform private.notify(o.buyer_id, 'Refund sent', o.ref || ': ' || private.php(rf.amount_centavos)
      || ' is on its way to your original payment method.', '/buyer/orders/' || o.id);
    for cl in select id from public.claims where online_refund_id = rf.id loop
      perform private.try_resolve_claim(cl);
    end loop;
  end if;
  perform private.audit('refund.succeeded', 'refunds', rf.id::text, jsonb_build_object('amount_centavos', rf.amount_centavos));
end $$;

-- ---------------------------------------------------------------- delivery top-up checkout

-- Buyer: pays the delivery difference a booking found. One open payment per order; a retry with the same key returns it.
create function public.start_shipping_topup_checkout(p_order_id uuid, p_idempotency_key uuid, p_method public.payment_method)
returns table (checkout_id uuid, amount_centavos bigint)
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_user();
  o public.orders;
  co public.checkouts;
begin
  if p_idempotency_key is null then
    raise exception 'Idempotency key required' using errcode = '22023';
  end if;
  select * into co from public.checkouts x where x.buyer_id = uid and x.idempotency_key = p_idempotency_key;
  if co.id is not null then
    return query select co.id, co.total_centavos;
    return;
  end if;
  select * into o from public.orders where id = p_order_id and buyer_id = uid for update;
  if o.id is null then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;
  if o.status in ('pending_payment', 'cancelled') or o.shipping_due_centavos <= 0 then
    raise exception 'This order has no delivery difference to pay' using errcode = '22023';
  end if;
  if o.courier_booking_claimed_at is not null
     or exists (select 1 from public.shipments sh where sh.order_id = o.id and sh.voided_at is null) then
    raise exception 'This order already has a courier booking' using errcode = '22023';
  end if;
  if exists (select 1 from public.checkouts x where x.order_id = o.id and x.status = 'pending') then
    raise exception 'A payment for this order is already open. Finish it, or wait a few minutes and try again.' using errcode = '22023';
  end if;
  insert into public.checkouts (buyer_id, method, total_centavos, idempotency_key, expires_at, order_id, shipping_topup)
  values (uid, p_method, o.shipping_due_centavos, p_idempotency_key,
    now() + make_interval(mins => coalesce(private.setting_int('checkout_ttl_minutes'), 15)), o.id, true)
  returning * into co;
  insert into public.payments (checkout_id, method, amount_centavos) values (co.id, p_method, o.shipping_due_centavos);
  perform private.audit('checkout.shipping_topup', 'checkouts', co.id::text,
    jsonb_build_object('order_id', o.id, 'due_centavos', o.shipping_due_centavos));
  return query select co.id, o.shipping_due_centavos;
end $$;

-- Same as 20261124161542_deal_agreements.sql, plus the delivery top-up branch: the amount joins shipping, total and
-- the online payment of the order (total = items + fees + shipping still holds), with no second commission.
create or replace function private.confirm_checkout(p_checkout_id uuid, p_payment_id uuid, p_fee bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare
  co public.checkouts;
  o public.orders;
  paid bigint;
  share bigint;
  given bigint := 0;
  first_order uuid;
  review_txn uuid := gen_random_uuid();
begin
  select * into co from public.checkouts where id = p_checkout_id for update;
  update public.checkouts set status = 'paid' where id = co.id;

  if co.order_id is not null and co.shipping_topup then
    select * into o from public.orders where id = co.order_id for update;
    if o.status = 'cancelled' or o.shipping_due_centavos = 0
       or exists (select 1 from public.shipments sh where sh.order_id = o.id and sh.voided_at is null) then
      -- Not owed any more: same as confirm_payment's review path (held as unmatched, finance refunds it).
      -- One txn id for both lines: every ledger transaction must balance on its own.
      update public.checkouts set status = 'needs_review' where id = co.id;
      update public.payments set status = 'needs_review' where id = p_payment_id;
      perform private.post(review_txn, 'gateway_clearing', co.total_centavos, 0, 'Unmatched payment', p_payment => p_payment_id);
      perform private.post(review_txn, 'unmatched_payments', 0, co.total_centavos, 'Unmatched payment', p_payment => p_payment_id);
      perform private.notify_admins(array['finance', 'support']::public.admin_sub_role[], 'Payment needs review',
        'A delivery payment arrived for an order that no longer needs it and must be refunded.', '/admin/payments');
      perform private.notify(co.buyer_id, 'Payment needs review',
        o.ref || ': the delivery difference was no longer needed when your payment arrived. TULAY will refund it to your original payment method.',
        '/buyer/orders/' || o.id);
      perform private.audit('payment.needs_review', 'payments', p_payment_id::text,
        jsonb_build_object('order_id', o.id, 'reason', 'shipping top-up no longer owed', 'amount_centavos', co.total_centavos));
      return;
    end if;
    update public.orders set shipping_centavos = shipping_centavos + co.total_centavos,
      total_centavos = total_centavos + co.total_centavos,
      paid_online_centavos = paid_online_centavos + co.total_centavos,
      gateway_fee_centavos = gateway_fee_centavos + p_fee,
      shipping_due_centavos = greatest(shipping_due_centavos - co.total_centavos, 0)
    where id = co.order_id returning * into o;
    o.commission_centavos := 0;
    perform private.post_order_paid(o, co.total_centavos, p_fee, p_payment_id);
    perform private.audit('order.shipping_topup_paid', 'orders', o.id::text, jsonb_build_object('amount_centavos', co.total_centavos));
    perform private.notify(s.owner_id, 'Delivery difference paid', o.ref || ': the delivery difference is paid. Book the pickup again.',
      '/supplier/orders/' || o.id)
    from public.suppliers s where s.id = o.supplier_id;
    return;
  end if;

  if co.order_id is not null then
    -- Balance of a split order: commission was recognised with the downpayment, so none is charged again.
    update public.orders set paid_online_centavos = paid_online_centavos + co.total_centavos,
      gateway_fee_centavos = gateway_fee_centavos + p_fee
    where id = co.order_id returning * into o;
    o.commission_centavos := 0;
    perform private.post_order_paid(o, co.total_centavos, p_fee, p_payment_id);
    perform private.audit('order.balance_paid', 'orders', o.id::text, jsonb_build_object('amount_centavos', co.total_centavos));
    perform private.notify(s.owner_id, 'Balance paid', o.ref || ' is fully paid and can ship.', '/supplier/orders/' || o.id)
    from public.suppliers s where s.id = o.supplier_id;
    perform private.notify(co.buyer_id, 'Balance paid', o.ref || ' is fully paid. Thank you.', '/buyer/orders/' || o.id);
    return;
  end if;

  -- Gateway fee split by the amount each order paid online (largest takes the rounding remainder).
  for o in select * from public.orders where checkout_id = co.id order by
    (case when payment_option in ('cod', 'split') then downpayment_centavos else total_centavos end) desc, id
  loop
    paid := case when o.payment_option in ('cod', 'split') then o.downpayment_centavos else o.total_centavos end;
    share := case when co.total_centavos > 0 then (p_fee * paid) / co.total_centavos else 0 end;
    if first_order is null then
      first_order := o.id;
    end if;
    update public.orders set gateway_fee_centavos = share, paid_online_centavos = paid where id = o.id;
    given := given + share;
  end loop;
  update public.orders set gateway_fee_centavos = gateway_fee_centavos + (p_fee - given) where id = first_order;

  for o in select * from public.orders where checkout_id = co.id loop
    perform private.set_order_status(o.id,
      case when o.payment_option in ('cod', 'split') then 'confirmed' else 'paid' end::public.order_status,
      case o.payment_option when 'cod' then 'COD order confirmed' when 'split' then 'Downpayment paid' else 'Payment confirmed' end);
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

-- ---------------------------------------------------------------- voiding a booking the courier ended

-- Service role: the booking died before pickup. The booked price goes back to the supplier (reversing the booking
-- lines once), the shipment is marked voided and the order can be booked again.
create function public.void_shipment(p_shipment_id uuid, p_reason text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  sh public.shipments;
  o public.orders;
  price bigint;
  why text := coalesce(nullif(left(btrim(coalesce(p_reason, '')), 500), ''), 'Ended by the courier');
  txn uuid := gen_random_uuid();
begin
  select * into sh from public.shipments where id = p_shipment_id for update;
  if sh.id is null then
    raise exception 'Shipment not found' using errcode = 'P0002';
  end if;
  if sh.voided_at is not null then
    return false;
  end if;
  if sh.manual then
    raise exception 'A shipment the supplier entered cannot be voided' using errcode = '22023';
  end if;
  if sh.status <> 'booked' then
    raise exception 'Only a booking not picked up yet can be voided' using errcode = '22023';
  end if;
  select * into o from public.orders where id = sh.order_id for update;
  price := coalesce(sh.price_centavos, o.shipping_centavos);
  perform private.post(txn, 'courier_payable', price, 0, 'Courier booking voided', o.supplier_id, o.id);
  perform private.post(txn, 'supplier_payable', 0, price, 'Courier booking voided', o.supplier_id, o.id);
  update public.shipments set voided_at = now(), void_reason = why where id = sh.id;
  perform private.notify_supplier(o.supplier_id, 'Courier booking ended',
    sh.tracking_ref || ': the courier ended the booking (' || why || '). Book again or ship with your own courier.',
    '/supplier/orders/' || o.id);
  perform private.audit('shipment.void', 'shipments', sh.id::text, jsonb_build_object('order_id', o.id, 'reason', why, 'price_centavos', price));
  return true;
end $$;

-- Service role (webhook): returns 'voided', 'unknown' (no such active TULAY booking) or 'flagged' (already picked up).
create function public.void_shipment_by_ref(p_carrier text, p_tracking_ref text, p_reason text) returns text
language plpgsql security definer set search_path = '' as $$
declare sh public.shipments;
begin
  select * into sh from public.shipments
  where carrier = p_carrier and tracking_ref = p_tracking_ref and not manual and voided_at is null;
  if sh.id is null then
    return 'unknown';
  end if;
  if sh.status <> 'booked' then
    perform public.flag_courier_issue(p_carrier, p_tracking_ref, sh.order_id,
      'The courier ended booking ' || p_tracking_ref || ' (' || left(coalesce(p_reason, ''), 200) || ') but the parcel was already picked up.');
    return 'flagged';
  end if;
  perform public.void_shipment(sh.id, p_reason);
  return 'voided';
end $$;

-- Support: voids the order's active TULAY booking after checking the courier dashboard.
create function public.admin_void_shipment(p_order_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare sid uuid;
begin
  if not public.has_admin_role('support') then
    raise exception 'Support role with MFA required' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Say why the booking is voided' using errcode = '22023';
  end if;
  select id into sid from public.shipments where order_id = p_order_id and not manual and voided_at is null;
  if sid is null then
    raise exception 'This order has no courier booking to void' using errcode = 'P0002';
  end if;
  perform public.void_shipment(sid, p_reason);
end $$;

-- Service role: Lalamove replaced the order (new id) after a cancel-and-clone.
create function public.replace_shipment_ref(p_carrier text, p_prev_ref text, p_new_ref text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare sid uuid;
begin
  update public.shipments set tracking_ref = btrim(p_new_ref)
  where carrier = p_carrier and tracking_ref = p_prev_ref and not manual and voided_at is null
  returning id into sid;
  if sid is null then
    return false;
  end if;
  perform private.audit('shipment.ref_replaced', 'shipments', sid::text,
    jsonb_build_object('carrier', p_carrier, 'from', p_prev_ref, 'to', p_new_ref));
  return true;
end $$;

-- ---------------------------------------------------------------- existing functions: ignore voided shipments

-- Courier webhook: only the active shipment TULAY booked with that courier (events for a voided booking are unknown).
create or replace function public.record_tracking_event(
  p_carrier text, p_event_id text, p_tracking_ref text, p_status public.shipment_status, p_occurred_at timestamptz,
  p_note text, p_cod_collected_centavos bigint, p_payload jsonb
) returns text
language plpgsql security definer set search_path = '' as $$
declare sid uuid;
begin
  select id into sid from public.shipments
  where carrier = p_carrier and tracking_ref = p_tracking_ref and not manual and voided_at is null;
  if sid is null then
    perform private.audit('tracking.unknown', 'shipments', p_tracking_ref, jsonb_build_object('event_id', p_event_id));
    return 'unknown';
  end if;
  return private.apply_tracking_event(sid, p_event_id, p_status, p_occurred_at, p_note, p_cod_collected_centavos, p_payload);
end $$;

-- Supplier: own-courier shipment. A voided booking does not count as "tracking already recorded".
create or replace function public.record_manual_shipment(p_order_id uuid, p_carrier text, p_carrier_name text, p_tracking_ref text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  o public.orders := private.my_order(p_order_id, 'supplier');
  sh public.shipments;
  x uuid;
begin
  if o.fulfilment_mode <> 'courier' then
    raise exception 'This order is not delivered by courier' using errcode = '22023';
  end if;
  if p_carrier is null or p_carrier not in ('jnt', 'lbc', 'gogoxpress', 'ninjavan', 'flash', 'lalamove', 'other') then
    raise exception 'Choose a courier' using errcode = '22023';
  end if;
  perform private.check_ready(o);
  if exists (select 1 from public.shipments where order_id = o.id and voided_at is null) then
    raise exception 'Tracking is already recorded for this order' using errcode = '22023';
  end if;
  if o.courier_booking_claimed_at is not null then
    raise exception 'A booking is already in progress for this order. TULAY support will check it.' using errcode = '22023';
  end if;
  -- The supplier ships on its own courier, so no delivery difference is owed: close an open top-up payment.
  for x in select id from public.checkouts where order_id = o.id and shipping_topup and status = 'pending' for update loop
    perform private.release_checkout(x, 'cancelled', 'Delivery price no longer owed');
  end loop;
  update public.orders set shipping_due_centavos = 0 where id = o.id;
  insert into public.shipments (order_id, carrier, carrier_name, tracking_ref, manual, cod_amount_centavos)
  values (o.id, p_carrier, case when p_carrier = 'other' then btrim(coalesce(p_carrier_name, '')) else '' end, btrim(p_tracking_ref), true,
    case when o.payment_option = 'cod' then o.total_centavos - o.paid_online_centavos else 0 end)
  returning * into sh;
  perform private.audit('order.shipment', 'shipments', sh.id::text, jsonb_build_object('order_id', o.id, 'carrier', p_carrier, 'manual', true));
  perform private.manual_event(sh, 'picked_up', 'Handed to the courier');
  return sh.id;
end $$;

-- Buyer cancel (20261122110049_audit_money_fixes.sql). Same, except a voided booking does not block it, and a booking
-- in progress (claim set, courier maybe booked, no shipment row yet) does.
create or replace function public.cancel_order(p_order_id uuid, p_reason text default '') returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_user();
  o public.orders;
  res public.stock_reservations;
  rid uuid;
  window_hours integer := coalesce(private.setting_int('custom_cancel_window_hours'), 24);
begin
  select * into o from public.orders where id = p_order_id and buyer_id = uid for update;
  if o.id is null then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;
  if o.status not in ('paid', 'confirmed') then
    raise exception 'Only orders that are not in production yet can be cancelled' using errcode = '22023';
  end if;
  if o.courier_booking_claimed_at is not null
     or exists (select 1 from public.shipments where order_id = o.id and voided_at is null) then
    raise exception 'A courier is already booked for this order. Contact the supplier or TULAY support.' using errcode = '22023';
  end if;
  if o.proof_approved_at is not null then
    raise exception 'Cancellation ends once you approve the proof' using errcode = '22023';
  end if;
  if private.is_custom(o.id) and o.paid_at < now() - make_interval(hours => window_hours) then
    raise exception 'Custom orders can be cancelled within % hours of payment; contact the supplier or TULAY support', window_hours
      using errcode = '22023';
  end if;
  update public.orders set shipping_due_centavos = 0 where id = o.id;
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

-- Support: records a booking found in the courier dashboard after an unknown result (the claim stays until then).
-- Same path as the server: record_shipment (clears the claim, posts the price), then the excess refund if any.
create function public.admin_record_courier_booking(
  p_order_id uuid, p_carrier text, p_tracking_ref text, p_price_centavos bigint, p_share_link text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  sid uuid;
  rid uuid;
  ref text := btrim(coalesce(p_tracking_ref, ''));
  link text := nullif(btrim(coalesce(p_share_link, '')), '');
begin
  if not public.has_admin_role('support') then
    raise exception 'Support role with MFA required' using errcode = '42501';
  end if;
  if p_carrier is null or p_carrier not in ('lalamove', 'fake') then
    raise exception 'Choose a courier TULAY books' using errcode = '22023';
  end if;
  if char_length(ref) not between 1 and 100 then
    raise exception 'Enter the tracking reference' using errcode = '22023';
  end if;
  if p_price_centavos is null or p_price_centavos not between 1 and 10000000 then
    raise exception 'Enter the booked price' using errcode = '22023';
  end if;
  if link is not null and (link not like 'https://%' or char_length(link) > 500) then
    raise exception 'The share link must start with https://' using errcode = '22023';
  end if;
  sid := public.record_shipment(p_order_id, p_carrier, ref, p_price_centavos, link);
  rid := public.refund_shipping_excess(p_order_id);
  perform private.audit('order.shipment_by_support', 'shipments', sid::text,
    jsonb_build_object('order_id', p_order_id, 'carrier', p_carrier, 'price_centavos', p_price_centavos, 'refund_id', rid));
  return jsonb_build_object('shipment_id', sid, 'refund_id', rid);
end $$;

-- Finance: send again a refund the gateway refused (20261115115828_audit_fixes_2.sql). Same, but the new refund keeps
-- shipping_adjustment, so it still returns no commission.
create or replace function public.admin_reissue_refund(p_refund_id uuid, p_idempotency_key uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  rf public.refunds;
  rid uuid;
begin
  if not public.has_admin_role('finance') then
    raise exception 'Finance role with MFA required' using errcode = '42501';
  end if;
  select id into rid from public.refunds where idempotency_key = p_idempotency_key;
  if rid is not null then
    return rid;
  end if;
  select * into rf from public.refunds where id = p_refund_id for update;
  if rf.id is null then
    raise exception 'Refund not found' using errcode = 'P0002';
  end if;
  if rf.status <> 'failed' then
    raise exception 'Only failed refunds can be sent again' using errcode = '22023';
  end if;
  if exists (select 1 from public.refunds where idempotency_key <> rf.idempotency_key and reason = rf.reason
               and payment_id = rf.payment_id and order_id is not distinct from rf.order_id and amount_centavos = rf.amount_centavos
               and status <> 'failed' and created_at > rf.created_at) then
    raise exception 'This refund was already sent again' using errcode = '22023';
  end if;
  insert into public.refunds (order_id, payment_id, amount_centavos, reason, idempotency_key, requested_by, shipping_adjustment)
  values (rf.order_id, rf.payment_id, rf.amount_centavos, rf.reason, p_idempotency_key, auth.uid(), rf.shipping_adjustment)
  returning id into rid;
  update public.claims set online_refund_id = rid where online_refund_id = rf.id;
  perform private.audit('refund.reissue', 'refunds', rid::text, jsonb_build_object('failed_refund_id', rf.id));
  return rid;
end $$;

update public.platform_settings set description = 'Largest COD order in centavos. 0 = COD off. Keep 0 while courier orders '
  || 'ship on TULAY''s courier account: the courier would pay the COD cash to TULAY, not the supplier.'
where key = 'cod_max_order_centavos';

-- ---------------------------------------------------------------- privileges + RLS

revoke all on public.courier_quotes from anon, authenticated;
grant select on public.courier_quotes to authenticated;
alter table public.courier_quotes enable row level security;
-- No write policies: quotes are written by save_courier_quote (service role).
create policy "courier_quotes: own" on public.courier_quotes for select to authenticated using (buyer_id = (select auth.uid()));

revoke execute on all functions in schema private from public, anon, authenticated;
revoke execute on function
  public.set_pickup_settings(text, text, text, text, text, text, text, text, integer, numeric, numeric, text),
  public.start_checkout(uuid, public.payment_method, uuid, public.payment_option, uuid[]),
  public.start_shipping_topup_checkout(uuid, uuid, public.payment_method),
  public.admin_void_shipment(uuid, text),
  public.admin_release_courier_booking(uuid, text),
  public.admin_record_courier_booking(uuid, text, text, bigint, text),
  public.save_courier_quote(uuid, uuid, uuid, text, text, bigint),
  public.begin_courier_booking(uuid, bigint),
  public.release_courier_booking(uuid, text),
  public.flag_courier_issue(text, text, uuid, text),
  public.record_shipment(uuid, text, text, bigint, text),
  public.refund_shipping_excess(uuid),
  public.void_shipment(uuid, text),
  public.void_shipment_by_ref(text, text, text),
  public.replace_shipment_ref(text, text, text)
  from public, anon, authenticated;
grant execute on function
  public.set_pickup_settings(text, text, text, text, text, text, text, text, integer, numeric, numeric, text),
  public.start_checkout(uuid, public.payment_method, uuid, public.payment_option, uuid[]),
  public.start_shipping_topup_checkout(uuid, uuid, public.payment_method),
  public.admin_void_shipment(uuid, text),
  public.admin_release_courier_booking(uuid, text),
  public.admin_record_courier_booking(uuid, text, text, bigint, text)
  to authenticated;
grant execute on function
  public.save_courier_quote(uuid, uuid, uuid, text, text, bigint),
  public.begin_courier_booking(uuid, bigint),
  public.release_courier_booking(uuid, text),
  public.flag_courier_issue(text, text, uuid, text),
  public.record_shipment(uuid, text, text, bigint, text),
  public.refund_shipping_excess(uuid),
  public.void_shipment(uuid, text),
  public.void_shipment_by_ref(text, text, text),
  public.replace_shipment_ref(text, text, text)
  to service_role;
