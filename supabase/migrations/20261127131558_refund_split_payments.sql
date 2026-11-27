-- An order can be paid by several payments: the cart/deal checkout, a split-order balance checkout and delivery
-- top-up checkouts. A refund must never exceed the payment it is sent against, so every order refund is now split
-- across the order's paid payments (newest first), one refund row per payment.

-- group_id: null = the refund is its own group (head); split parts and reissues point at the head.
-- reissue_of: the failed refund a new row replaces.
alter table public.refunds
  add column group_id uuid references public.refunds (id),
  add column reissue_of uuid references public.refunds (id);
create index refunds_group_idx on public.refunds (group_id);
create index refunds_reissue_of_idx on public.refunds (reissue_of);

-- Creates the refund rows for an order and returns the head id (null when p_amount <= 0). Raises before inserting
-- anything when the order's paid payments cannot take p_amount. The payment rows stay locked, so two refunds cannot
-- both spend the same left-over. p_idempotency_key (optional) goes on the head row; parts get fresh keys.
create function private.create_order_refund(
  p_order public.orders, p_amount bigint, p_reason text, p_requested_by uuid,
  p_shipping_adjustment boolean default false, p_idempotency_key uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  pay record;
  remaining bigint := p_amount;
  allocatable bigint := 0;
  take bigint;
  head uuid;
  rid uuid;
begin
  if p_amount is null or p_amount <= 0 then
    return null;
  end if;
  -- Order lock first, always: refunds of one order run one at a time, and every caller takes locks in the same
  -- order (order, then payments), so settle_claim cannot deadlock with cancel_order and the others.
  perform 1 from public.orders where id = p_order.id for update;
  for pay in
    select p.id, p.amount_centavos - coalesce((select sum(r.amount_centavos) from public.refunds r
        where r.payment_id = p.id and r.status <> 'failed'), 0) as left_centavos
    from public.payments p join public.checkouts c on c.id = p.checkout_id
    where (c.id = p_order.checkout_id or c.order_id = p_order.id) and p.status = 'paid'
    for update of p
  loop
    allocatable := allocatable + greatest(pay.left_centavos, 0);
  end loop;
  if allocatable < p_amount then
    raise exception 'Refund up to %', private.php(allocatable) using errcode = '22023';
  end if;
  for pay in
    select p.id, p.amount_centavos - coalesce((select sum(r.amount_centavos) from public.refunds r
        where r.payment_id = p.id and r.status <> 'failed'), 0) as left_centavos
    from public.payments p join public.checkouts c on c.id = p.checkout_id
    where (c.id = p_order.checkout_id or c.order_id = p_order.id) and p.status = 'paid'
    order by p.paid_at desc nulls last, p.created_at desc, p.id desc
  loop
    exit when remaining <= 0;
    take := least(remaining, greatest(pay.left_centavos, 0));
    continue when take <= 0;
    insert into public.refunds (order_id, payment_id, amount_centavos, reason, idempotency_key, requested_by, shipping_adjustment, group_id)
    values (p_order.id, pay.id, take, p_reason,
      case when head is null then coalesce(p_idempotency_key, gen_random_uuid()) else gen_random_uuid() end,
      p_requested_by, p_shipping_adjustment, head)
    returning id into rid;
    head := coalesce(head, rid);
    remaining := remaining - take;
  end loop;
  -- The check above read left-overs before waiting on the locks; never create less than asked without saying so.
  if remaining > 0 then
    raise exception 'Refund up to %', private.php(p_amount - remaining) using errcode = '22023';
  end if;
  return head;
end $$;
revoke all on function private.create_order_refund(public.orders, bigint, text, uuid, boolean, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- claims: the group rule

-- A refund-pending claim is resolved once its online refund group is done and any COD part was paid back.
-- Group rule: the claim points at the group head; every row of the group (parts and reissues) must be succeeded,
-- or failed with a reissue (reissue_of) of it; any pending row, or a failed row nobody reissued, keeps it open.
create or replace function private.try_resolve_claim(p_claim_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.claims;
begin
  select * into c from public.claims where id = p_claim_id for update;
  if c.status = 'refund_pending'
     and (c.online_refund_id is null or (
       exists (select 1 from public.refunds where coalesce(group_id, id) = c.online_refund_id and status = 'succeeded')
       and not exists (select 1 from public.refunds r where coalesce(r.group_id, r.id) = c.online_refund_id
         and (r.status = 'pending'
           or (r.status = 'failed' and not exists (select 1 from public.refunds x where x.reissue_of = r.id))))))
     and (c.manual_refund_centavos = 0 or c.manual_refund_ref <> '') then
    perform private.set_claim_status(c.id, 'resolved', 'Refund complete');
  end if;
end $$;

-- ---------------------------------------------------------------- complete_refund: claims follow the group head

-- Same as 20261127124305_lalamove.sql; only the claim loop changed.
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
    for cl in select id from public.claims where online_refund_id = coalesce(rf.group_id, rf.id) loop
      perform private.try_resolve_claim(cl);
    end loop;
  end if;
  perform private.audit('refund.succeeded', 'refunds', rf.id::text, jsonb_build_object('amount_centavos', rf.amount_centavos));
end $$;

-- ---------------------------------------------------------------- refund-creating functions

-- Same as 20261127124305_lalamove.sql; the refund goes through private.create_order_refund.
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
  rid := private.create_order_refund(o,
    (o.paid_online_centavos - coalesce((select sum(amount_centavos) from public.refunds where order_id = o.id and status <> 'failed'), 0))::bigint,
    'Order cancelled by the buyer', uid);
  if rid is null then
    perform private.reverse_commission(o.id, 'Commission reversed: cancelled');
  end if;
  perform private.notify(s.owner_id, 'Order cancelled', o.ref || ' was cancelled by the buyer before production.',
    '/supplier/orders/' || o.id)
  from public.suppliers s where s.id = o.supplier_id;
  perform private.audit('order.cancel', 'orders', o.id::text, jsonb_build_object('refund_id', rid));
  return rid;
end $$;

-- Same as 20261122110049_audit_money_fixes.sql; only the returned-parcel refund changed.
create or replace function private.apply_tracking_event(
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
      rid := private.create_order_refund(o,
        (o.paid_online_centavos - coalesce((select sum(amount_centavos) from public.refunds where order_id = o.id and status <> 'failed'), 0))::bigint,
        'Parcel returned to the supplier', null);
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

-- Same as 20261115115828_audit_fixes_2.sql; only the insert changed.
create or replace function private.settle_claim(p_claim_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  c public.claims;
  o public.orders;
  net bigint;
  online_left bigint;
  online_part bigint;
  rid uuid;
begin
  select * into c from public.claims where id = p_claim_id for update;
  select * into o from public.orders where id = c.order_id;
  if c.remedy = 'replacement' then
    perform private.set_claim_status(c.id, 'replacement_pending', 'Replacement to be sent');
    perform private.notify_supplier(c.supplier_id, 'Send the replacement', c.ref || ': please send the replacement to the buyer.', '/supplier/claims/' || c.id);
    return;
  end if;

  net := greatest(c.refund_centavos - c.restocking_fee_centavos, 0);
  online_left := o.paid_online_centavos - coalesce((select sum(amount_centavos) from public.refunds where order_id = o.id and status <> 'failed'), 0);
  online_part := least(net, greatest(online_left, 0));
  rid := private.create_order_refund(o, online_part, 'Claim ' || c.ref, auth.uid());
  update public.claims set online_refund_id = rid, manual_refund_centavos = net - online_part where id = c.id;

  if net = 0 then
    perform private.set_claim_status(c.id, 'resolved', 'Nothing left to refund after the restocking fee');
  else
    -- Resolved by complete_refund / record_manual_refund once the money actually moved.
    perform private.set_claim_status(c.id, 'refund_pending',
      case when net - online_part > 0 then 'Supplier to pay back the cash-on-delivery part directly' else 'Refund being sent' end);
    if net - online_part > 0 then
      perform private.notify_supplier(c.supplier_id, 'Refund the buyer', c.ref || ': please send the buyer '
        || private.php(net - online_part) || ' (the cash-on-delivery part) and record the reference.', '/supplier/claims/' || c.id);
    end if;
    perform private.notify(c.buyer_id, 'Claim approved', c.ref || ': a refund of ' || private.php(net) || ' is on its way.', '/buyer/claims/' || c.id);
  end if;
  perform private.audit('claim.settle', 'claims', c.id::text,
    jsonb_build_object('net_centavos', net, 'online_centavos', online_part, 'refund_id', rid));
end $$;

-- Same as 20261115115828_audit_fixes_2.sql; only the insert changed. A retry with the same key finds the head.
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
    raise exception 'Refund up to % on this order', private.php(refundable) using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Give a reason' using errcode = '22023';
  end if;
  rid := private.create_order_refund(o, p_amount_centavos, btrim(coalesce(p_reason, '')), auth.uid(), false, p_idempotency_key);
  perform private.audit('refund.request', 'refunds', rid::text,
    jsonb_build_object('order_id', o.id, 'amount_centavos', p_amount_centavos, 'reason', p_reason));
  return rid;
end $$;

-- Same as 20261127124305_lalamove.sql; only the insert changed.
create or replace function public.refund_shipping_excess(p_order_id uuid) returns uuid
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
  rid := private.create_order_refund(o, excess, 'Delivery cost less than paid: difference refunded', null, true);
  if rid is null then
    return null;
  end if;
  perform private.notify(o.buyer_id, 'Delivery cost refunded', o.ref || ': delivery cost ' || private.php(excess)
    || ' less than you paid. The difference is being refunded.', '/buyer/orders/' || o.id);
  perform private.audit('order.shipping_excess_refund', 'refunds', rid::text,
    jsonb_build_object('order_id', o.id, 'excess_centavos', excess));
  return rid;
end $$;

-- Finance: send again a refund the gateway refused. The new row joins the same group (reissue_of points at the failed
-- row, same payment and amount) and claims stay on the group head. Same as 20261127124305_lalamove.sql otherwise.
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
  if exists (select 1 from public.refunds where reissue_of = rf.id and status <> 'failed') then
    raise exception 'This refund was already sent again' using errcode = '22023';
  end if;
  insert into public.refunds (order_id, payment_id, amount_centavos, reason, idempotency_key, requested_by, shipping_adjustment, group_id, reissue_of)
  values (rf.order_id, rf.payment_id, rf.amount_centavos, rf.reason, p_idempotency_key, auth.uid(), rf.shipping_adjustment,
    coalesce(rf.group_id, rf.id), rf.id)
  returning id into rid;
  perform private.audit('refund.reissue', 'refunds', rid::text, jsonb_build_object('failed_refund_id', rf.id));
  return rid;
end $$;
