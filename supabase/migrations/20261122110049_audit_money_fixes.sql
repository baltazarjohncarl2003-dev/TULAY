-- Fixes from the 2026-11-22 repo audit: refund caps, cancelling booked orders, manual tracking numbers,
-- payouts on returned custom orders, unmatched payments, the contact form limit and public columns.

-- ---------------------------------------------------------------- refund cap (every path)

-- Runs on every refund, so a reissue or two refunds at the same moment cannot pass what was really paid.
create function private.guard_refund_total() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  paid bigint;
  used bigint;
begin
  if new.order_id is not null then
    select paid_online_centavos into paid from public.orders where id = new.order_id for update;
    select coalesce(sum(amount_centavos), 0) into used from public.refunds where order_id = new.order_id and status <> 'failed';
  else
    perform 1 from public.payments where id = new.payment_id for update;
    select coalesce(sum(credit_centavos), 0) into paid from public.ledger_entries
    where payment_id = new.payment_id and account = 'unmatched_payments';
    select coalesce(sum(amount_centavos), 0) into used from public.refunds
    where payment_id = new.payment_id and order_id is null and status <> 'failed';
  end if;
  if used + new.amount_centavos > coalesce(paid, 0) then
    raise exception 'Refund up to % on this payment', private.php(greatest(coalesce(paid, 0) - used, 0)) using errcode = '22023';
  end if;
  return new;
end $$;
revoke all on function private.guard_refund_total() from public;

create trigger refunds_guard_total before insert on public.refunds
for each row execute function private.guard_refund_total();

-- ---------------------------------------------------------------- cancelling after a courier is booked

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
  if exists (select 1 from public.shipments where order_id = o.id) then
    raise exception 'A courier is already booked for this order. Contact the supplier or TULAY support.' using errcode = '22023';
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

-- ---------------------------------------------------------------- manual tracking numbers

-- A typed-in number proves nothing, so it must not block a real booking or receive that parcel's webhooks.
alter table public.shipments drop constraint shipments_carrier_tracking_ref_key;
create unique index shipments_carrier_tracking_ref_booked on public.shipments (carrier, tracking_ref) where not manual;

create function private.apply_tracking_event(
  p_shipment_id uuid, p_event_id text, p_status public.shipment_status, p_occurred_at timestamptz,
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
  select * into sh from public.shipments where id = p_shipment_id for update;
  insert into public.tracking_events (shipment_id, carrier, event_id, status, note, occurred_at, payload)
  values (sh.id, sh.carrier, p_event_id, p_status, left(coalesce(p_note, ''), 500), at, coalesce(p_payload, '{}'))
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
  elsif p_status = 'failed_attempt' and o.status = 'shipped' then
    perform private.notify(o.buyer_id, 'Delivery attempt failed',
      o.ref || ': the courier could not deliver. ' || coalesce(nullif(p_note, ''), 'They will try again.'), '/buyer/orders/' || o.id);
    perform private.notify(s.owner_id, 'Delivery attempt failed',
      o.ref || ': ' || coalesce(nullif(p_note, ''), 'the courier could not deliver') || '. Contact the buyer if needed.', '/supplier/orders/' || o.id)
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
revoke all on function private.apply_tracking_event(uuid, text, public.shipment_status, timestamptz, text, bigint, jsonb) from public;

-- Courier webhook: only shipments TULAY booked with that courier.
create or replace function public.record_tracking_event(
  p_carrier text, p_event_id text, p_tracking_ref text, p_status public.shipment_status, p_occurred_at timestamptz,
  p_note text, p_cod_collected_centavos bigint, p_payload jsonb
) returns text
language plpgsql security definer set search_path = '' as $$
declare sid uuid;
begin
  select id into sid from public.shipments where carrier = p_carrier and tracking_ref = p_tracking_ref and not manual;
  if sid is null then
    perform private.audit('tracking.unknown', 'shipments', p_tracking_ref, jsonb_build_object('event_id', p_event_id));
    return 'unknown';
  end if;
  return private.apply_tracking_event(sid, p_event_id, p_status, p_occurred_at, p_note, p_cod_collected_centavos, p_payload);
end $$;

create or replace function private.manual_event(p_shipment public.shipments, p_status public.shipment_status, p_note text) returns text
language plpgsql security definer set search_path = '' as $$
begin
  return private.apply_tracking_event(p_shipment.id, 'manual-' || gen_random_uuid(), p_status, now(),
    left(btrim(coalesce(p_note, '')), 500), null, jsonb_build_object('manual', true, 'by', auth.uid()));
end $$;

-- ---------------------------------------------------------------- payouts on returned custom orders

create or replace function private.schedule_payouts() returns integer
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
        or (o.status = 'cancelled' and b.balance > 0 and private.is_custom(o.id) -- refused custom goods: the supplier keeps the payment
            and not exists (select 1 from public.refunds r where r.order_id = o.id and r.status = 'pending')
            and exists (select 1 from public.shipments s join public.tracking_events te on te.shipment_id = s.id
                        where s.order_id = o.id and te.status = 'returned' and te.occurred_at <= now() - make_interval(days => delay)))
      );
    select coalesce(sum(balance), 0) into amount from due;
    if amount > 0 then
      insert into public.payouts (supplier_id, amount_centavos) values (sup, amount) returning id into pid;
      insert into public.payout_items (payout_id, order_id, amount_centavos) select pid, order_id, balance from due;
      perform private.notify_supplier(sup, 'Payout scheduled', private.php(amount) || ' is scheduled for release.', '/supplier/payouts');
      perform private.notify_admins(array['finance']::public.admin_sub_role[], 'Payout to release',
        private.php(amount) || ' is scheduled for a supplier.', '/admin/payouts');
      made := made + 1;
    end if;
  end loop;
  return made;
end $$;

-- ---------------------------------------------------------------- unmatched payments

create or replace function public.admin_refund_unmatched(p_payment_id uuid, p_idempotency_key uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  pay public.payments;
  received bigint;
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
  -- What the gateway really sent, which can differ from what the checkout expected.
  select coalesce(sum(credit_centavos), 0) into received from public.ledger_entries
  where payment_id = pay.id and account = 'unmatched_payments';
  insert into public.refunds (order_id, payment_id, amount_centavos, reason, idempotency_key, requested_by)
  values (null, pay.id, received, 'Payment did not match an open checkout', p_idempotency_key, auth.uid())
  returning id into rid;
  perform private.audit('refund.request', 'refunds', rid::text, jsonb_build_object('payment_id', pay.id));
  return rid;
end $$;

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
  -- A gateway can report one payment under several event ids; only the first one moves money in the ledger.
  if pay.status = 'paid' then
    return 'already_paid';
  end if;
  if pay.status = 'needs_review' then
    return 'already_needs_review';
  end if;
  select * into co from public.checkouts where id = pay.checkout_id for update;
  fee := coalesce(p_fee_centavos, private.gateway_fee(pay.method, pay.amount_centavos));

  if co.status <> 'pending' or p_amount_centavos is distinct from pay.amount_centavos then
    -- Close the checkout first so its orders are cancelled and its stock goes back on sale.
    perform private.release_checkout(co.id, 'cancelled', 'Payment did not match the checkout');
    update public.payments set status = 'needs_review', paid_at = now(), fee_centavos = fee where id = pay.id;
    txn := gen_random_uuid();
    perform private.post(txn, 'gateway_clearing', p_amount_centavos, 0, 'Unmatched payment', p_payment => pay.id);
    perform private.post(txn, 'unmatched_payments', 0, p_amount_centavos, 'Unmatched payment', p_payment => pay.id);
    perform private.notify_admins(array['finance', 'support']::public.admin_sub_role[], 'Payment needs review',
      'A payment did not match an open checkout and needs a refund.', '/admin/payments');
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

-- ---------------------------------------------------------------- contact form limit

insert into public.platform_settings (key, value, description) values
  ('contact_messages_per_hour', '30', 'Contact form messages accepted per hour across the whole site, so a script cannot flood support.')
on conflict (key) do nothing;

create index contact_messages_created_idx on public.contact_messages (created_at desc);

create or replace function public.submit_contact_message(p_topic text, p_name text, p_email text, p_reference text, p_message text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  new_id uuid;
  v_email text := lower(btrim(coalesce(p_email, '')));
begin
  -- Serialise the check-then-insert so concurrent posts cannot overshoot the limit.
  perform pg_advisory_xact_lock(hashtext('submit_contact_message'));
  if (select count(*) from public.contact_messages where created_at > now() - interval '1 hour')
     >= coalesce(private.setting_int('contact_messages_per_hour'), 30) then
    raise exception 'The contact form is busy. Please try again later.' using errcode = '22023';
  end if;
  if (select count(*) from public.contact_messages where email = v_email and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'Too many messages from this email. Please try again later.' using errcode = '22023';
  end if;
  insert into public.contact_messages (topic, name, email, reference, message, user_id)
  values (btrim(p_topic), btrim(p_name), v_email, btrim(coalesce(p_reference, '')), btrim(p_message), auth.uid())
  returning id into new_id;
  perform private.notify_support(
    case when p_topic like 'privacy%' then 'Privacy request' else 'New contact message' end,
    btrim(p_name) || ': ' || left(btrim(p_message), 200), '/admin/messages');
  return new_id;
end $$;

create or replace function public.admin_update_setting(p_key text, p_value jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  old jsonb;
  n numeric;
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
  if jsonb_typeof(p_value) = 'number' then
    if p_value::text !~ '^[0-9]+$' then
      raise exception 'Setting % must be a whole number of 0 or more', p_key using errcode = '22023';
    end if;
    n := p_value::text::numeric;
    if n > 2147483647 then
      raise exception 'Setting % is too large', p_key using errcode = '22023';
    end if;
    if p_key like '%\_bps' and n > 10000 then
      raise exception 'Setting % is in basis points: 0 to 10000 (100%%)', p_key using errcode = '22023';
    end if;
    if (p_key like '%\_days' or p_key like '%\_minutes' or p_key like '%\_hours' or p_key like '%\_per\_day' or p_key like '%\_per\_hour'
        or p_key in ('rfq_max_invites', 'cod_max_refusals')) and n < 1 then
      raise exception 'Setting % must be at least 1', p_key using errcode = '22023';
    end if;
  end if;
  if jsonb_typeof(p_value) = 'string' then
    if char_length(p_value #>> '{}') > 200 then
      raise exception 'Setting % is too long', p_key using errcode = '22023';
    end if;
    if p_key like '%email' and (p_value #>> '{}') <> '' and (p_value #>> '{}') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      raise exception 'Setting % must be an email address', p_key using errcode = '22023';
    end if;
  end if;

  update public.platform_settings set value = p_value, updated_at = now(), updated_by = auth.uid() where key = p_key;
  perform private.audit('setting.update', 'platform_settings', p_key, jsonb_build_object('from', old, 'to', p_value));
end $$;

-- ---------------------------------------------------------------- public columns

-- Listings: TULAY's review note and the creation key are not public.
revoke select on public.products from anon, authenticated;
grant select (id, supplier_id, category_id, title, description, moq, unit, indicative_price_centavos, lead_days,
  return_class, listing_type, status, submitted_at, reviewed_at, created_at, updated_at, stock)
  on public.products to anon, authenticated;

create function public.product_review_notes(p_ids uuid[]) returns table (product_id uuid, note text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.review_note from public.products p
  where p.id = any (p_ids)
    and (public.is_admin() or exists (select 1 from public.suppliers s where s.id = p.supplier_id and s.owner_id = auth.uid()));
$$;
revoke all on function public.product_review_notes(uuid[]) from public, anon;
grant execute on function public.product_review_notes(uuid[]) to authenticated;

-- Reviews: storefronts read this view, which leaves out who wrote the review and on which order.
create view public.public_reviews as
  select id, supplier_id, rating, body, supplier_reply, replied_at, created_at
  from public.reviews where not hidden;
revoke all on public.public_reviews from public, anon, authenticated;
grant select on public.public_reviews to anon, authenticated;

alter view public.supplier_ratings set (security_invoker = false); -- totals only, and the base table is no longer public
drop policy "reviews: visible are public" on public.reviews;
revoke select on public.reviews from anon;

-- ---------------------------------------------------------------- admin functions

revoke execute on function public.admin_add_banned_term(text) from public, anon;
revoke execute on function public.admin_remove_banned_term(text) from public, anon;
grant execute on function public.admin_add_banned_term(text) to authenticated;
grant execute on function public.admin_remove_banned_term(text) to authenticated;
