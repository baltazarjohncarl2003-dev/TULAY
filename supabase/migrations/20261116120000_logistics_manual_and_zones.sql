-- Logistics before the permit (TULAY_LOGISTICS_PLAN.md, "do now"):
--  * Manual shipments: the supplier ships on its own courier account (J&T, LBC, GoGo Xpress, Ninja Van,
--    Flash, Lalamove, other) and types the courier and tracking number. No webhook, so the supplier posts
--    progress, the buyer confirms delivery (or it auto-confirms), and only support records a returned parcel.
--    Every status change still goes through record_tracking_event, so refunds and notices stay in one place.
--  * Shipping fee by zone: each supplier may set a fee for Metro Manila, Luzon, Visayas and Mindanao.
--    Unknown province or no rate = the platform flat fee. The fee is frozen on the order as before.
--  * Admin setting for the "no update for N days" shipment filter.

insert into public.platform_settings (key, value, description) values
  ('shipment_stale_days', '3', 'Days without a tracking update before a shipment shows in the admin "stale" filter.');
update public.platform_settings set description = 'Courier fee per order when the supplier has no fee for the delivery zone (or the province is not recognised).'
where key = 'shipping_flat_fee_centavos';

-- ---------------------------------------------------------------- manual shipments

alter table public.shipments drop constraint shipments_carrier_check;
alter table public.shipments
  add constraint shipments_carrier_check
    check (carrier in ('fake', 'ninjavan', 'jnt', 'lbc', 'gogoxpress', 'flash', 'lalamove', 'other')),
  add column manual boolean not null default false,
  add column carrier_name text not null default '' check (char_length(carrier_name) <= 60),
  add constraint shipments_other_named check (carrier <> 'other' or char_length(btrim(carrier_name)) >= 2),
  add constraint shipments_test_not_manual check (not (manual and carrier = 'fake'));

-- True when tracking for this order comes from a courier webhook (courier mode, no manual shipment).
create function private.webhook_tracked(p_order public.orders) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_order.fulfilment_mode = 'courier'
     and not exists (select 1 from public.shipments s where s.order_id = p_order.id and s.manual);
$$;

-- One manual tracking update, through the same logic as a courier webhook.
create function private.manual_event(p_shipment public.shipments, p_status public.shipment_status, p_note text) returns text
language plpgsql security definer set search_path = '' as $$
begin
  return public.record_tracking_event(p_shipment.carrier, 'manual-' || gen_random_uuid(), p_shipment.tracking_ref, p_status, now(),
    left(btrim(coalesce(p_note, '')), 500), null, jsonb_build_object('manual', true, 'by', auth.uid()));
end $$;

-- Supplier: the parcel was handed to its own courier. Order moves to shipped (picked up).
create function public.record_manual_shipment(p_order_id uuid, p_carrier text, p_carrier_name text, p_tracking_ref text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  o public.orders := private.my_order(p_order_id, 'supplier');
  sh public.shipments;
begin
  if o.fulfilment_mode <> 'courier' then
    raise exception 'This order is not delivered by courier' using errcode = '22023';
  end if;
  if p_carrier is null or p_carrier not in ('jnt', 'lbc', 'gogoxpress', 'ninjavan', 'flash', 'lalamove', 'other') then
    raise exception 'Choose a courier' using errcode = '22023';
  end if;
  perform private.check_ready(o);
  if exists (select 1 from public.shipments where order_id = o.id) then
    raise exception 'Tracking is already recorded for this order' using errcode = '22023';
  end if;
  insert into public.shipments (order_id, carrier, carrier_name, tracking_ref, manual, cod_amount_centavos)
  values (o.id, p_carrier, case when p_carrier = 'other' then btrim(coalesce(p_carrier_name, '')) else '' end, btrim(p_tracking_ref), true,
    case when o.payment_option = 'cod' then o.total_centavos - o.paid_online_centavos else 0 end)
  returning * into sh;
  perform private.audit('order.shipment', 'shipments', sh.id::text, jsonb_build_object('order_id', o.id, 'carrier', p_carrier, 'manual', true));
  perform private.manual_event(sh, 'picked_up', 'Handed to the courier');
  return sh.id;
end $$;

-- Supplier, manual shipments: progress the courier showed it. Delivered = mark_delivered; returned = support.
create function public.report_shipment_update(p_order_id uuid, p_status public.shipment_status, p_note text default '') returns void
language plpgsql security definer set search_path = '' as $$
declare
  o public.orders := private.my_order(p_order_id, 'supplier');
  sh public.shipments;
begin
  select * into sh from public.shipments where order_id = o.id and manual;
  if sh.id is null then
    raise exception 'This order has no manually entered tracking' using errcode = '22023';
  end if;
  if p_status is null or p_status not in ('in_transit', 'out_for_delivery', 'failed_attempt') then
    raise exception 'Use Mark delivered for a delivery; a returned parcel is recorded by support' using errcode = '22023';
  end if;
  if o.status <> 'shipped' then
    raise exception 'This order is not on the way' using errcode = '22023';
  end if;
  perform private.manual_event(sh, p_status, p_note);
end $$;

-- Support: a manually tracked parcel came back. Same cancel / refund rules as a courier "returned" event.
-- Returns what record_tracking_event returns (refund:<id> when a refund must be sent).
create function public.admin_record_parcel_returned(p_order_id uuid, p_note text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  sh public.shipments;
  res text;
begin
  if not public.has_admin_role('support') then
    raise exception 'Support role with MFA required' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_note, ''))) < 3 then
    raise exception 'Say why the parcel came back' using errcode = '22023';
  end if;
  select * into sh from public.shipments where order_id = p_order_id and manual for update;
  if sh.id is null then
    raise exception 'This order has no manually entered tracking' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.orders where id = p_order_id and status = 'shipped') then
    raise exception 'Only an order on the way can be marked returned' using errcode = '22023';
  end if;
  res := private.manual_event(sh, 'returned', p_note);
  perform private.audit('shipment.returned', 'shipments', sh.id::text, jsonb_build_object('order_id', p_order_id, 'result', res));
  return res;
end $$;

-- Supplier says delivered: now also for manually tracked courier orders.
create or replace function public.mark_delivered(p_order_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare o public.orders := private.my_order(p_order_id, 'supplier');
begin
  if private.webhook_tracked(o) or o.status <> 'shipped' then
    raise exception 'Only handed-over orders without courier tracking can be marked delivered' using errcode = '22023';
  end if;
  update public.orders set delivery_claimed_at = coalesce(delivery_claimed_at, now()) where id = o.id;
  perform private.notify(o.buyer_id, 'Please confirm delivery',
    o.ref || ': the supplier says it was delivered. Confirm, or it is confirmed automatically in '
      || coalesce(private.setting_int('delivery_confirm_days'), 3) || ' days.', '/buyer/orders/' || o.id);
end $$;

create or replace function public.confirm_delivery(p_order_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare o public.orders := private.my_order(p_order_id, 'buyer');
begin
  if o.status <> 'shipped' or private.webhook_tracked(o) then
    raise exception 'This order cannot be confirmed here' using errcode = '22023';
  end if;
  perform private.deliver(o.id, now(), 'Delivery confirmed by the buyer');
end $$;

create or replace function private.auto_confirm_deliveries() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  o public.orders;
  n integer := 0;
begin
  for o in select * from public.orders
    where status = 'shipped' and delivery_claimed_at is not null
      and delivery_claimed_at < now() - make_interval(days => coalesce(private.setting_int('delivery_confirm_days'), 3))
  loop
    if not private.webhook_tracked(o) then
      perform private.deliver(o.id, now(), 'Delivery confirmed automatically');
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;

-- Delivered (courier, buyer confirmation or auto-confirmation). A manual shipment also gets its "delivered"
-- tracking step, and a COD order records the cash the supplier's courier collected (reconciliation only).
create or replace function private.deliver(p_order_id uuid, p_at timestamptz, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  o public.orders;
  sh public.shipments;
begin
  perform private.set_order_status(p_order_id, 'delivered', p_reason);
  update public.orders set delivered_at = p_at where id = p_order_id returning * into o;
  select * into sh from public.shipments where order_id = p_order_id and manual;
  if sh.id is not null then
    insert into public.tracking_events (shipment_id, carrier, event_id, status, note, occurred_at, payload)
    values (sh.id, sh.carrier, 'manual-delivered-' || sh.id, 'delivered', p_reason, p_at, jsonb_build_object('manual', true))
    on conflict do nothing;
    update public.shipments set status = 'delivered' where id = sh.id;
    if sh.cod_amount_centavos > 0 then
      insert into public.cod_remittances (order_id, amount_centavos) values (o.id, sh.cod_amount_centavos) on conflict do nothing;
    end if;
  end if;
  perform private.notify_supplier(o.supplier_id, 'Delivered', o.ref || ' was delivered. Payout becomes due '
      || coalesce(private.setting_int('payout_delay_days'), 7) || ' days after delivery.', '/supplier/orders/' || o.id);
end $$;

-- ---------------------------------------------------------------- shipping fee by zone

create type public.shipping_zone as enum ('metro_manila', 'luzon', 'visayas', 'mindanao');

-- Province (or common alias) to courier zone. Canonical rows feed the address form's province list.
create table public.ph_provinces (
  name text primary key,
  zone public.shipping_zone not null,
  canonical boolean not null default true
);
create unique index ph_provinces_lower_idx on public.ph_provinces (lower(name));

insert into public.ph_provinces (name, zone) values
  ('Metro Manila', 'metro_manila'),
  -- Luzon: CAR, I, II, III, IV-A, MIMAROPA, V
  ('Abra', 'luzon'), ('Apayao', 'luzon'), ('Benguet', 'luzon'), ('Ifugao', 'luzon'), ('Kalinga', 'luzon'), ('Mountain Province', 'luzon'),
  ('Ilocos Norte', 'luzon'), ('Ilocos Sur', 'luzon'), ('La Union', 'luzon'), ('Pangasinan', 'luzon'),
  ('Batanes', 'luzon'), ('Cagayan', 'luzon'), ('Isabela', 'luzon'), ('Nueva Vizcaya', 'luzon'), ('Quirino', 'luzon'),
  ('Aurora', 'luzon'), ('Bataan', 'luzon'), ('Bulacan', 'luzon'), ('Nueva Ecija', 'luzon'), ('Pampanga', 'luzon'), ('Tarlac', 'luzon'), ('Zambales', 'luzon'),
  ('Batangas', 'luzon'), ('Cavite', 'luzon'), ('Laguna', 'luzon'), ('Quezon', 'luzon'), ('Rizal', 'luzon'),
  ('Marinduque', 'luzon'), ('Occidental Mindoro', 'luzon'), ('Oriental Mindoro', 'luzon'), ('Palawan', 'luzon'), ('Romblon', 'luzon'),
  ('Albay', 'luzon'), ('Camarines Norte', 'luzon'), ('Camarines Sur', 'luzon'), ('Catanduanes', 'luzon'), ('Masbate', 'luzon'), ('Sorsogon', 'luzon'),
  -- Visayas: VI, VII, NIR, VIII
  ('Aklan', 'visayas'), ('Antique', 'visayas'), ('Capiz', 'visayas'), ('Guimaras', 'visayas'), ('Iloilo', 'visayas'), ('Negros Occidental', 'visayas'),
  ('Bohol', 'visayas'), ('Cebu', 'visayas'), ('Siquijor', 'visayas'), ('Negros Oriental', 'visayas'),
  ('Biliran', 'visayas'), ('Eastern Samar', 'visayas'), ('Leyte', 'visayas'), ('Northern Samar', 'visayas'), ('Samar', 'visayas'), ('Southern Leyte', 'visayas'),
  -- Mindanao: IX, X, XI, XII, XIII, BARMM
  ('Zamboanga del Norte', 'mindanao'), ('Zamboanga del Sur', 'mindanao'), ('Zamboanga Sibugay', 'mindanao'),
  ('Bukidnon', 'mindanao'), ('Camiguin', 'mindanao'), ('Lanao del Norte', 'mindanao'), ('Misamis Occidental', 'mindanao'), ('Misamis Oriental', 'mindanao'),
  ('Davao de Oro', 'mindanao'), ('Davao del Norte', 'mindanao'), ('Davao del Sur', 'mindanao'), ('Davao Occidental', 'mindanao'), ('Davao Oriental', 'mindanao'),
  ('Cotabato', 'mindanao'), ('Sarangani', 'mindanao'), ('South Cotabato', 'mindanao'), ('Sultan Kudarat', 'mindanao'),
  ('Agusan del Norte', 'mindanao'), ('Agusan del Sur', 'mindanao'), ('Dinagat Islands', 'mindanao'), ('Surigao del Norte', 'mindanao'), ('Surigao del Sur', 'mindanao'),
  ('Basilan', 'mindanao'), ('Lanao del Sur', 'mindanao'), ('Maguindanao del Norte', 'mindanao'), ('Maguindanao del Sur', 'mindanao'), ('Sulu', 'mindanao'), ('Tawi-Tawi', 'mindanao');
insert into public.ph_provinces (name, zone, canonical) values
  ('NCR', 'metro_manila', false), ('National Capital Region', 'metro_manila', false), ('Manila', 'metro_manila', false),
  ('Compostela Valley', 'mindanao', false), ('North Cotabato', 'mindanao', false), ('Maguindanao', 'mindanao', false);

-- A supplier's courier fee per zone. No row = the platform flat fee for that zone.
create table public.supplier_shipping_rates (
  supplier_id uuid not null references public.suppliers (id),
  zone public.shipping_zone not null,
  fee_centavos bigint not null check (fee_centavos between 0 and 10000000),
  updated_at timestamptz not null default now(),
  primary key (supplier_id, zone)
);
create trigger supplier_shipping_rates_touch before update on public.supplier_shipping_rates
  for each row execute function private.touch_updated_at();

-- Courier fee for one supplier order to a frozen ship_to (jsonb with "province").
create function private.shipping_fee(p_supplier_id uuid, p_ship_to jsonb) returns bigint
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select r.fee_centavos from public.supplier_shipping_rates r
       join public.ph_provinces p on p.zone = r.zone
      where r.supplier_id = p_supplier_id and lower(p.name) = lower(btrim(coalesce(p_ship_to ->> 'province', '')))),
    private.setting_int('shipping_flat_fee_centavos'), 0)::bigint;
$$;

-- Supplier: set the four zone fees (null = use the platform flat fee for that zone).
create function public.set_shipping_rates(p_metro_manila bigint, p_luzon bigint, p_visayas bigint, p_mindanao bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare
  sid uuid;
  z record;
begin
  perform private.require_user();
  select id into sid from public.suppliers where owner_id = auth.uid() and status = 'verified';
  if sid is null then
    raise exception 'Only a verified supplier can set shipping fees' using errcode = '42501';
  end if;
  for z in select * from (values ('metro_manila'::public.shipping_zone, p_metro_manila), ('luzon', p_luzon),
      ('visayas', p_visayas), ('mindanao', p_mindanao)) v(zone, fee) loop
    if z.fee is null then
      delete from public.supplier_shipping_rates where supplier_id = sid and zone = z.zone;
    else
      insert into public.supplier_shipping_rates (supplier_id, zone, fee_centavos) values (sid, z.zone, z.fee)
      on conflict (supplier_id, zone) do update set fee_centavos = excluded.fee_centavos;
    end if;
  end loop;
  perform private.audit('supplier.shipping_rates', 'suppliers', sid::text, jsonb_build_object(
    'metro_manila', p_metro_manila, 'luzon', p_luzon, 'visayas', p_visayas, 'mindanao', p_mindanao));
end $$;

-- Buyer cart display: the fee each cart supplier would charge to each of the caller's addresses.
-- start_checkout computes the same value itself; this is only for showing it.
create function public.cart_shipping_fees() returns table (address_id uuid, supplier_id uuid, fee_centavos bigint)
language sql stable security definer set search_path = '' as $$
  select a.id, s.supplier_id, private.shipping_fee(s.supplier_id, jsonb_build_object('province', a.province))
  from public.addresses a
  cross join (select distinct p.supplier_id from public.cart_items c join public.products p on p.id = c.product_id
              where c.user_id = auth.uid()) s
  where a.user_id = auth.uid();
$$;

-- Orders for a checkout. p_shipping null = each supplier's zone fee for p_ship_to (cart checkout);
-- a number = that fee on every order (RFQ deals pass 0: the quote priced delivery).
create or replace function private.create_orders(
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
  ship bigint;
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
    ship := coalesce(p_shipping, private.shipping_fee(sup, p_ship_to));
    total := items + p_fees + ship;
    -- COD: custom-made items need an online downpayment first (admin setting); stock items can be full COD.
    down := case when p_option = 'cod' and custom then private.bps_of(total, private.setting_int('cod_downpayment_bps'))
                 when p_option = 'cod' then 0 else total end;
    insert into public.orders (checkout_id, buyer_id, supplier_id, items_centavos, fees_centavos, shipping_centavos, total_centavos,
      commission_centavos, fulfilment_mode, ship_to, payment_option, downpayment_centavos)
    values (p_checkout_id, p_buyer, sup, items, p_fees, ship, total, comm, p_mode, p_ship_to, p_option,
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

-- start_checkout (from 20261115115052_audit_fixes.sql) with per-supplier zone fees: appended below.
create or replace function public.start_checkout(
  p_idempotency_key uuid, p_method public.payment_method, p_address_id uuid, p_payment_option public.payment_option default 'online'
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

  -- Each supplier's zone fee for the address (flat fee when none); live courier quotes wait for the permit.
  due := private.create_orders(co.id, uid, lines, 0, null,
    'courier', ship, p_payment_option);
  if p_payment_option = 'cod' then
    perform private.check_cod(co.id, uid);
  end if;
  perform private.finish_checkout(co.id, p_method, due);
  perform private.audit('checkout.start', 'checkouts', co.id::text,
    jsonb_build_object('due_centavos', due, 'method', p_method, 'option', p_payment_option));
  return query select co.id, due;
end $$;

-- ---------------------------------------------------------------- privileges + RLS

revoke all on public.ph_provinces, public.supplier_shipping_rates from anon, authenticated;
grant select on public.ph_provinces, public.supplier_shipping_rates to anon, authenticated;
alter table public.ph_provinces enable row level security;
alter table public.supplier_shipping_rates enable row level security;
create policy "ph_provinces: public" on public.ph_provinces for select to anon, authenticated using (true);
-- Fees are public prices (shown before checkout); writes only through set_shipping_rates.
create policy "supplier_shipping_rates: public" on public.supplier_shipping_rates for select to anon, authenticated using (true);

revoke execute on all functions in schema private from public, anon, authenticated;
revoke execute on function
  public.record_manual_shipment(uuid, text, text, text),
  public.report_shipment_update(uuid, public.shipment_status, text),
  public.admin_record_parcel_returned(uuid, text),
  public.set_shipping_rates(bigint, bigint, bigint, bigint),
  public.cart_shipping_fees()
  from public, anon;
grant execute on function
  public.record_manual_shipment(uuid, text, text, text),
  public.report_shipment_update(uuid, public.shipment_status, text),
  public.admin_record_parcel_returned(uuid, text),
  public.set_shipping_rates(bigint, bigint, bigint, bigint),
  public.cart_shipping_fees()
  to authenticated;
