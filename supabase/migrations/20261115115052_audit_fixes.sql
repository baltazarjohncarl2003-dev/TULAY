-- Audit fixes (2026-11-15):
--  1. A payment that does not match its open checkout no longer leaves the checkout's stock reserved and
--     its orders pending forever: the checkout is released (orders cancelled, stock returned), then the
--     payment is parked for a finance refund. An RFQ deal can be paid again afterwards.
--  2. A new cart checkout no longer cancels an earlier one whose gateway session is already open (the
--     buyer may be paying in another tab); the buyer is asked to finish or wait for it to expire.
--  3. Custom orders can only be cancelled within custom_cancel_window_hours of payment (admin setting).
--  4. Courier tracking: a late, older event no longer moves the shipment status backwards; a returned
--     parcel puts the stock back and refunds what was paid online for non-custom items.

-- ---------------------------------------------------------------- 1. mismatched payment

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
    -- Close the checkout first so its orders are cancelled and its stock goes back on sale.
    perform private.release_checkout(co.id, 'cancelled', 'Payment did not match the checkout');
    update public.payments set status = 'needs_review', paid_at = now(), fee_centavos = fee where id = pay.id;
    txn := gen_random_uuid();
    perform private.post(txn, 'gateway_clearing', p_amount_centavos, 0, 'Unmatched payment', p_payment => pay.id);
    perform private.post(txn, 'unmatched_payments', 0, p_amount_centavos, 'Unmatched payment', p_payment => pay.id);
    perform private.notify_support('Payment needs review', 'A payment did not match an open checkout.', '/admin/payments');
    perform private.notify(co.buyer_id, 'Payment needs review',
      'We received a payment that did not match your order. TULAY will refund it to your original payment method.', '/buyer/orders');
    perform private.audit('payment.needs_review', 'payments', pay.id::text,
      jsonb_build_object('checkout_status', co.status, 'amount_centavos', p_amount_centavos));
    return 'needs_review';
  end if;

  update public.payments set status = 'paid', paid_at = now(), fee_centavos = fee where id = pay.id;
  perform private.confirm_checkout(co.id, pay.id, fee);
  perform private.audit('payment.paid', 'payments', pay.id::text, jsonb_build_object('fee_centavos', fee, 'event_id', p_event_id));
  return 'paid';
end $$;

-- ---------------------------------------------------------------- 2. checkout with a payment in progress

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

-- ---------------------------------------------------------------- 3. custom-order cancellation window

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
  if o.proof_approved_at is not null then
    raise exception 'Cancellation ends once you approve the proof' using errcode = '22023';
  end if;
  if private.is_custom(o.id) and o.paid_at < now() - make_interval(hours => window_hours) then
    raise exception 'Custom orders can be cancelled within % hours of payment; contact the supplier or TULAY support', window_hours
      using errcode = '22023';
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

-- ---------------------------------------------------------------- 4. courier tracking

-- Returns: recorded | duplicate | unknown | refund:<refund id> (the webhook route then sends that refund).
create or replace function public.record_tracking_event(
  p_carrier text, p_event_id text, p_tracking_ref text, p_status public.shipment_status, p_occurred_at timestamptz,
  p_note text, p_cod_collected_centavos bigint, p_payload jsonb
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  sh public.shipments;
  o public.orders;
  res public.stock_reservations;
  at timestamptz := coalesce(p_occurred_at, now());
  rid uuid;
begin
  select * into sh from public.shipments where carrier = p_carrier and tracking_ref = p_tracking_ref for update;
  if sh.id is null then
    perform private.audit('tracking.unknown', 'shipments', p_tracking_ref, jsonb_build_object('event_id', p_event_id));
    return 'unknown';
  end if;
  insert into public.tracking_events (shipment_id, carrier, event_id, status, note, occurred_at, payload)
  values (sh.id, p_carrier, p_event_id, p_status, left(coalesce(p_note, ''), 500), at, coalesce(p_payload, '{}'))
  on conflict do nothing;
  if not found then
    return 'duplicate';
  end if;
  -- An older event arriving late is kept for the history but does not move the shipment status back.
  if not exists (select 1 from public.tracking_events where shipment_id = sh.id and occurred_at > at) then
    update public.shipments set status = p_status where id = sh.id;
  end if;
  select * into o from public.orders where id = sh.order_id for update;

  if p_status in ('picked_up', 'in_transit', 'out_for_delivery') and o.status in ('paid', 'confirmed', 'in_production') then
    perform private.set_order_status(o.id, 'shipped', 'Picked up by the courier');
    perform private.notify(o.buyer_id, 'On the way', o.ref || ' was picked up by the courier.', '/buyer/orders/' || o.id);
  elsif p_status = 'delivered' and o.status not in ('delivered', 'completed', 'cancelled') then
    perform private.deliver(o.id, at, 'Delivered by the courier');
    if coalesce(p_cod_collected_centavos, 0) > 0 then
      insert into public.cod_remittances (order_id, amount_centavos) values (o.id, p_cod_collected_centavos) on conflict do nothing;
    end if;
    perform private.notify(o.buyer_id, 'Delivered', o.ref || ' was delivered.', '/buyer/orders/' || o.id);
    perform private.notify(s.owner_id, 'Delivered', o.ref || ' was delivered to the buyer.', '/supplier/orders/' || o.id)
    from public.suppliers s where s.id = o.supplier_id;
  elsif p_status = 'returned' and o.status not in ('delivered', 'completed', 'cancelled') then
    -- Refused or undeliverable. Custom goods cannot be resold, so their online payment / COD downpayment is kept;
    -- stock items go back on sale and what the buyer paid online is refunded. Commission is reversed either way.
    perform private.set_order_status(o.id, 'cancelled', 'Returned to the supplier: ' || coalesce(nullif(p_note, ''), 'delivery failed'));
    if o.payment_option = 'cod' then
      update public.orders set refused_at = now() where id = o.id;
    end if;
    for res in select * from public.stock_reservations where order_id = o.id and status = 'converted' for update loop
      perform private.return_stock(res);
      update public.stock_reservations set status = 'released' where id = res.id;
    end loop;
    perform private.reverse_commission(o.id, 'Commission reversed: returned');
    if not private.is_custom(o.id) then
      insert into public.refunds (order_id, payment_id, amount_centavos, reason, idempotency_key)
      select o.id, p.id, x.left_centavos, 'Parcel returned to the supplier', gen_random_uuid()
      from public.payments p
      cross join lateral (select o.paid_online_centavos - coalesce((select sum(amount_centavos) from public.refunds
          where order_id = o.id and status <> 'failed'), 0) as left_centavos) x
      where p.checkout_id = o.checkout_id and x.left_centavos > 0
      returning id into rid;
    end if;
    perform private.notify(o.buyer_id, 'Delivery failed',
      o.ref || ' was returned to the supplier.' || case when rid is not null then ' Your online payment will be refunded.' else '' end,
      '/buyer/orders/' || o.id);
    perform private.notify(s.owner_id, 'Parcel returned', o.ref || ' is coming back to you.', '/supplier/orders/' || o.id)
    from public.suppliers s where s.id = o.supplier_id;
    perform private.notify_support('Parcel returned', o.ref || ' was returned to the supplier.', '/admin/shipments');
  end if;
  return case when rid is not null then 'refund:' || rid else 'recorded' end;
end $$;
