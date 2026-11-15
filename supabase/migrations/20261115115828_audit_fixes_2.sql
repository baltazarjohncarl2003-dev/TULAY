-- Audit fixes, part 2 (2026-11-15). See TULAY_COMPLETE_AUDIT_CHECKLIST.md for the finding ids.
--  * Notifications: supplier/product decisions, new applications and listings for verifiers, delivery and
--    payout events for suppliers, claim messages, escalations, return tracking, review replies; finance hears
--    about payments that need a refund. (S-2, A-5, A-13, B-17)
--  * User-facing amounts in pesos, not centavos. (B-9, A-1, A-16, S-14)
--  * Claims stay refund_pending until the gateway refund succeeded; finance can re-issue a failed refund. (S-6)
--  * Stock edits are checked against the value the supplier saw (no lost updates). (S-4)
--  * A proof needs the buyer's artwork first; a returned change-of-mind item goes back into stock. (S-17, S-15)
--  * Finished claims take no more messages. (B-20, S-27)
--  * Settings are range-checked; commission steps on a parent category apply to its subcategories; declined
--    invites do not count toward the invite cap; removing an admin's last sub-role makes them a buyer again.
--    (A-2, A-7, A-14, A-21)
--  * Courier booking is checked before the courier is called; suspended suppliers cannot upload proofs. (S-3, S-18)

-- ---------------------------------------------------------------- helpers

-- 150000 -> 'PHP 1,500.00'
create function private.php(p_centavos bigint) returns text
language sql immutable set search_path = '' as $$
  select 'PHP ' || to_char(coalesce(p_centavos, 0) / 100.0, 'FM999,999,999,990.00');
$$;

-- Notifies every active admin holding one of the roles (super admins always).
create function private.notify_admins(p_roles public.admin_sub_role[], p_title text, p_body text, p_link text) returns void
language sql security definer set search_path = '' as $$
  insert into public.notifications (user_id, title, body, link)
  select distinct p.id, left(p_title, 120), left(p_body, 500), p_link
  from public.profiles p join public.admin_roles ar on ar.user_id = p.id
  where p.role = 'admin' and p.status = 'active' and (ar.sub_role = any (p_roles) or ar.sub_role = 'super_admin');
$$;

create function private.notify_supplier(p_supplier_id uuid, p_title text, p_body text, p_link text) returns void
language sql security definer set search_path = '' as $$
  insert into public.notifications (user_id, title, body, link)
  select s.owner_id, left(p_title, 120), left(p_body, 500), p_link from public.suppliers s where s.id = p_supplier_id;
$$;

-- ---------------------------------------------------------------- decisions and submissions (triggers)

create function private.on_supplier_status() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.to_status = 'pending' then
    perform private.notify_admins(array['verifier']::public.admin_sub_role[], 'Supplier application to review',
      (select business_name from public.suppliers where id = new.supplier_id) || ' applied to sell on TULAY.', '/admin/suppliers');
  elsif new.to_status in ('verified', 'rejected', 'suspended', 'restricted') then
    perform private.notify_supplier(new.supplier_id,
      case new.to_status when 'verified' then 'You are verified' when 'rejected' then 'Application not approved'
        when 'suspended' then 'Account suspended' else 'Account restricted' end,
      case new.to_status when 'verified' then 'You can now list products and quote on requests.'
        else coalesce(nullif(new.reason, ''), 'Contact TULAY support for details.') end,
      '/supplier/profile');
  end if;
  return null;
end $$;
create trigger supplier_status_notify after insert on public.supplier_status_history
  for each row execute function private.on_supplier_status();

create function private.on_product_status() returns trigger
language plpgsql security definer set search_path = '' as $$
declare p public.products;
begin
  select * into p from public.products where id = new.product_id;
  if new.to_status = 'pending' then
    perform private.notify_admins(array['verifier']::public.admin_sub_role[], 'Listing to review', '"' || p.title || '" was submitted for review.', '/admin/products');
  elsif new.to_status in ('approved', 'rejected') then
    perform private.notify_supplier(p.supplier_id,
      case new.to_status when 'approved' then 'Listing approved' else 'Listing not approved' end,
      '"' || p.title || '"' || case when new.to_status = 'approved' then ' is now live.' else ': ' || coalesce(nullif(new.reason, ''), 'see the review note.') end,
      '/supplier/products');
  end if;
  return null;
end $$;
create trigger product_status_notify after insert on public.product_status_history
  for each row execute function private.on_product_status();

-- ---------------------------------------------------------------- delivery and payouts

-- Delivered (courier, buyer confirmation or auto-confirmation): the supplier hears the payout clock started.
create or replace function private.deliver(p_order_id uuid, p_at timestamptz, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare o public.orders;
begin
  perform private.set_order_status(p_order_id, 'delivered', p_reason);
  update public.orders set delivered_at = p_at where id = p_order_id returning * into o;
  perform private.notify_supplier(o.supplier_id, 'Delivered', o.ref || ' was delivered. Payout becomes due '
      || coalesce(private.setting_int('payout_delay_days'), 7) || ' days after delivery.', '/supplier/orders/' || o.id);
end $$;

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

-- Checks a courier booking before the courier is called (the booking itself costs money). (S-3)
create function public.check_can_book_shipment(p_order_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare o public.orders := private.my_order(p_order_id, 'supplier');
begin
  if o.fulfilment_mode <> 'courier' then
    raise exception 'This order is not delivered by courier' using errcode = '22023';
  end if;
  perform private.check_ready(o);
  if exists (select 1 from public.shipments where order_id = o.id) then
    raise exception 'A courier is already booked for this order' using errcode = '22023';
  end if;
end $$;

-- ---------------------------------------------------------------- COD message in pesos (B-9)

create or replace function private.check_cod(p_checkout_id uuid, p_uid uuid) returns void
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
    raise exception 'Orders above % must be paid online', private.php(cap) using errcode = '22023';
  end if;
end $$;

-- ---------------------------------------------------------------- refunds

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
  insert into public.refunds (order_id, payment_id, amount_centavos, reason, idempotency_key, requested_by)
  select o.id, p.id, p_amount_centavos, btrim(coalesce(p_reason, '')), p_idempotency_key, auth.uid()
  from public.payments p where p.checkout_id = o.checkout_id
  returning id into rid;
  perform private.audit('refund.request', 'refunds', rid::text,
    jsonb_build_object('order_id', o.id, 'amount_centavos', p_amount_centavos, 'reason', p_reason));
  return rid;
end $$;

-- Finance: send again a refund the gateway refused. Returns the new pending refund (claims follow it).
create function public.admin_reissue_refund(p_refund_id uuid, p_idempotency_key uuid) returns uuid
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
  insert into public.refunds (order_id, payment_id, amount_centavos, reason, idempotency_key, requested_by)
  values (rf.order_id, rf.payment_id, rf.amount_centavos, rf.reason, p_idempotency_key, auth.uid())
  returning id into rid;
  update public.claims set online_refund_id = rid where online_refund_id = rf.id;
  perform private.audit('refund.reissue', 'refunds', rid::text, jsonb_build_object('failed_refund_id', rf.id));
  return rid;
end $$;

-- A refund-pending claim is resolved once its online refund succeeded and any COD part was paid back.
create function private.try_resolve_claim(p_claim_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.claims;
begin
  select * into c from public.claims where id = p_claim_id for update;
  if c.status = 'refund_pending'
     and (c.online_refund_id is null or exists (select 1 from public.refunds where id = c.online_refund_id and status = 'succeeded'))
     and (c.manual_refund_centavos = 0 or c.manual_refund_ref <> '') then
    perform private.set_claim_status(c.id, 'resolved', 'Refund complete');
  end if;
end $$;

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
    comm := least(left_c, case when o.paid_online_centavos > 0 then (o.commission_centavos * rf.amount_centavos) / o.paid_online_centavos else 0 end);
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

-- ---------------------------------------------------------------- claims

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
  if online_part > 0 then
    insert into public.refunds (order_id, payment_id, amount_centavos, reason, idempotency_key, requested_by)
    select o.id, p.id, online_part, 'Claim ' || c.ref, gen_random_uuid(), auth.uid()
    from public.payments p where p.checkout_id = o.checkout_id
    returning id into rid;
  end if;
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

create or replace function private.accept_claim(
  p_claim public.claims, p_remedy public.claim_remedy, p_refund_centavos bigint, p_return_required boolean, p_note text
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  fee bigint := 0;
  bps integer;
  must_return boolean := p_return_required or p_claim.type = 'return';
  cap bigint := private.claimable_left(p_claim.order_id);
begin
  if p_remedy is null then
    raise exception 'Choose refund or replacement' using errcode = '22023';
  end if;
  if p_remedy = 'refund' then
    if p_refund_centavos is null or p_refund_centavos <= 0 or p_refund_centavos > cap then
      raise exception 'Refund up to % on this order', private.php(cap) using errcode = '22023';
    end if;
    if p_claim.type = 'return' then
      select least(restocking_fee_bps, coalesce(private.setting_int('restocking_fee_max_bps'), 0)) into bps
      from public.suppliers where id = p_claim.supplier_id;
      fee := private.bps_of(p_refund_centavos, bps);
    end if;
  end if;
  update public.claims set
    remedy = p_remedy,
    refund_centavos = case when p_remedy = 'refund' then p_refund_centavos else 0 end,
    restocking_fee_centavos = fee,
    return_required = must_return,
    return_payer = case when must_return then case when p_claim.type = 'return' then 'buyer' else 'supplier' end end,
    ra_number = case when must_return then
      'RA-' || to_char(now() at time zone 'Asia/Manila', 'YYYY') || '-' || lpad(nextval('public.ra_seq')::text, 5, '0') end
  where id = p_claim.id;
  if must_return then
    perform private.set_claim_status(p_claim.id, 'awaiting_return', coalesce(p_note, ''));
    perform private.notify(p_claim.buyer_id, 'Return approved',
      p_claim.ref || ': send the item back with the return number shown on the claim.', '/buyer/claims/' || p_claim.id);
  else
    perform private.settle_claim(p_claim.id);
  end if;
end $$;

create or replace function public.record_manual_refund(p_claim_id uuid, p_reference text) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.claims := private.my_claim(p_claim_id, 'supplier');
begin
  if c.status <> 'refund_pending' or c.manual_refund_centavos = 0 or c.manual_refund_ref <> '' then
    raise exception 'No direct refund is due on this claim' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_reference, ''))) < 3 then
    raise exception 'Enter the transfer reference' using errcode = '22023';
  end if;
  update public.claims set manual_refund_ref = left(btrim(p_reference), 200) where id = c.id;
  insert into public.claim_status_history (claim_id, from_status, to_status, note, actor_id)
  values (c.id, c.status, c.status, 'Paid back directly: ' || left(btrim(p_reference), 200), auth.uid());
  perform private.notify(c.buyer_id, 'Refund sent', c.ref || ': the supplier sent ' || private.php(c.manual_refund_centavos)
    || ' directly (ref ' || left(btrim(p_reference), 60) || ').', '/buyer/claims/' || c.id);
  perform private.try_resolve_claim(c.id);
end $$;

-- Supplier: the returned item arrived -> change-of-mind returns go back into stock, then settle. (S-15)
create or replace function public.confirm_return_received(p_claim_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  c public.claims := private.my_claim(p_claim_id, 'supplier');
  it record;
begin
  if c.status <> 'awaiting_return' then
    raise exception 'No return is expected on this claim' using errcode = '22023';
  end if;
  update public.claims set return_received_at = now() where id = c.id;
  if c.type = 'return' then
    for it in select i.product_id, i.variant_id, i.quantity from public.order_items i
      where i.order_id = c.order_id and i.product_id is not null and (cardinality(c.item_ids) = 0 or i.id = any (c.item_ids))
    loop
      if it.variant_id is not null then
        update public.product_variants set stock = stock + it.quantity where id = it.variant_id and stock is not null;
      else
        update public.products set stock = stock + it.quantity where id = it.product_id and stock is not null;
      end if;
      if found then
        insert into public.stock_movements (product_id, variant_id, delta, reason, actor_id)
        values (it.product_id, it.variant_id, it.quantity, 'release', auth.uid());
      end if;
    end loop;
  end if;
  perform private.settle_claim(c.id);
end $$;

create or replace function public.add_claim_message(p_claim_id uuid, p_body text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_user();
  c public.claims;
  body text := btrim(coalesce(p_body, ''));
  owner uuid;
begin
  select * into c from public.claims where id = p_claim_id;
  select owner_id into owner from public.suppliers where id = c.supplier_id;
  if c.id is null or not (c.buyer_id = uid or owner = uid or public.has_admin_role('support')) then
    raise exception 'Claim not found' using errcode = 'P0002';
  end if;
  if c.status in ('resolved', 'declined', 'cancelled') then
    raise exception 'This claim is closed' using errcode = '22023';
  end if;
  if body = '' or char_length(body) > 2000 then
    raise exception 'Messages are 1 to 2000 characters' using errcode = '22023';
  end if;
  insert into public.claim_messages (claim_id, sender_id, body) values (c.id, uid, body);
  if uid <> c.buyer_id then
    perform private.notify(c.buyer_id, 'New message on ' || c.ref, left(body, 200), '/buyer/claims/' || c.id);
  end if;
  if uid <> owner then
    perform private.notify(owner, 'New message on ' || c.ref, left(body, 200), '/supplier/claims/' || c.id);
  end if;
  if c.status = 'escalated' and not public.has_admin_role('support') then
    perform private.notify_support('New message on ' || c.ref, left(body, 200), '/admin/claims/' || c.id);
  end if;
end $$;

create or replace function public.escalate_claim(p_claim_id uuid, p_note text default '') returns void
language plpgsql security definer set search_path = '' as $$
declare c public.claims := private.my_claim(p_claim_id, 'buyer');
begin
  if not (c.status = 'rejected'
          or (c.status = 'open' and c.created_at < now() - make_interval(days => coalesce(private.setting_int('claim_response_days'), 3)))) then
    raise exception 'You can ask TULAY to step in after the supplier rejects or does not answer in time' using errcode = '22023';
  end if;
  perform private.set_claim_status(c.id, 'escalated', btrim(coalesce(p_note, '')));
  perform private.notify_support('Claim escalated', c.ref || ' needs a decision.', '/admin/claims/' || c.id);
  perform private.notify_supplier(c.supplier_id, 'Claim escalated', c.ref || ': the buyer asked TULAY to review this claim.', '/supplier/claims/' || c.id);
end $$;

create or replace function public.record_return_shipment(p_claim_id uuid, p_tracking_ref text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_user();
  c public.claims;
  v_ref text := left(btrim(coalesce(p_tracking_ref, '')), 100);
begin
  select * into c from public.claims where id = p_claim_id for update;
  if c.id is null or not (
       (c.return_payer = 'buyer' and c.buyer_id = uid)
    or (c.return_payer = 'supplier' and exists (select 1 from public.suppliers s where s.id = c.supplier_id and s.owner_id = uid))
  ) then
    raise exception 'Claim not found' using errcode = 'P0002';
  end if;
  if c.status <> 'awaiting_return' then
    raise exception 'No return is expected on this claim' using errcode = '22023';
  end if;
  update public.claims set return_tracking_ref = v_ref where id = c.id;
  if c.return_payer = 'buyer' then
    perform private.notify_supplier(c.supplier_id, 'Return on its way', c.ref || ': the buyer sent the item back (tracking ' || v_ref || ').', '/supplier/claims/' || c.id);
  else
    perform private.notify(c.buyer_id, 'Return pickup booked', c.ref || ': tracking ' || v_ref || '.', '/buyer/claims/' || c.id);
  end if;
end $$;

create or replace function public.reply_review(p_review_id uuid, p_reply text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_user();
  r public.reviews;
begin
  update public.reviews rv set supplier_reply = btrim(coalesce(p_reply, '')), replied_at = now()
  from public.suppliers s
  where rv.id = p_review_id and s.id = rv.supplier_id and s.owner_id = uid and rv.replied_at is null
    and char_length(btrim(coalesce(p_reply, ''))) between 1 and 1000
  returning rv.* into r;
  if r.id is null then
    raise exception 'You can reply once, 1 to 1000 characters' using errcode = '22023';
  end if;
  perform private.notify(r.buyer_id, 'The supplier replied to your review', left(r.supplier_reply, 200), '/buyer/orders/' || r.order_id);
end $$;

-- ---------------------------------------------------------------- proofs need artwork (S-17)

create or replace function public.send_proof(p_order_id uuid, p_storage_path text, p_note text default '') returns uuid
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
  if not exists (select 1 from public.artwork_files where order_id = o.id) then
    raise exception 'Wait for the buyer to upload their artwork first' using errcode = '22023';
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

drop policy "order-files: supplier uploads proofs" on storage.objects;
create policy "order-files: supplier uploads proofs" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'order-files' and (storage.foldername(name))[2] = 'proofs' and (select public.is_active_user())
    and exists (select 1 from public.orders o join public.suppliers s on s.id = o.supplier_id
                where o.id::text = (storage.foldername(name))[1] and o.paid_at is not null
                  and s.owner_id = (select auth.uid()) and s.status = 'verified')
  );

-- ---------------------------------------------------------------- stock without lost updates (S-4)

drop function public.set_stock(uuid, uuid, integer);
-- p_expected: the stock value the supplier's form showed; a mismatch means a sale or release happened since.
create function public.set_stock(p_product_id uuid, p_variant_id uuid, p_stock integer, p_expected integer default null) returns void
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
  else
    select stock into old from public.product_variants where id = p_variant_id and product_id = p_product_id for update;
    if not found then
      raise exception 'Option not found' using errcode = 'P0002';
    end if;
  end if;
  if old is distinct from p_expected then
    raise exception 'Stock changed to % since you opened this page (an order or cancellation). Check it and save again.',
      coalesce(old::text, 'not tracked') using errcode = '22023';
  end if;
  if p_variant_id is null then
    update public.products set stock = p_stock where id = p_product_id;
  else
    update public.product_variants set stock = p_stock where id = p_variant_id;
  end if;
  if coalesce(p_stock, 0) <> coalesce(old, 0) then
    insert into public.stock_movements (product_id, variant_id, delta, reason, actor_id)
    values (p_product_id, p_variant_id, coalesce(p_stock, 0) - coalesce(old, 0), 'adjust', auth.uid());
  end if;
end $$;

-- ---------------------------------------------------------------- admin (A-2, A-7, A-14, A-21)

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
    if (p_key like '%\_days' or p_key like '%\_minutes' or p_key like '%\_hours' or p_key like '%\_per\_day'
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

-- A step on a parent category also applies to its subcategories; a step on the subcategory itself wins.
create or replace function public.commission_rate_bps(p_category_id uuid, p_at timestamptz default now()) returns integer
language sql stable set search_path = '' as $$
  select coalesce((
    select s.rate_bps from public.commission_schedules s
    where s.starts_at <= p_at
      and (s.category_id is null or s.category_id = p_category_id
           or s.category_id = (select parent_id from public.categories where id = p_category_id))
    order by s.starts_at desc,
      case when s.category_id = p_category_id then 0 when s.category_id is not null then 1 else 2 end
    limit 1
  ), 0);
$$;

create or replace function public.admin_invite_suppliers(p_rfq_id uuid, p_supplier_ids uuid[]) returns integer
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
  -- Declined invites do not use up the cap.
  if (select count(*) from public.rfq_invites where rfq_id = p_rfq_id and status <> 'declined')
     + (select count(*) from unnest(p_supplier_ids) x where not exists (
          select 1 from public.rfq_invites i where i.rfq_id = p_rfq_id and i.supplier_id = x))
     > private.setting_int('rfq_max_invites') then
    raise exception 'An RFQ can have at most % active invitations', private.setting_int('rfq_max_invites') using errcode = '22023';
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

create or replace function public.admin_revoke_role(p_user_id uuid, p_sub_role public.admin_sub_role) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_admin_role('super_admin') then
    raise exception 'Super admin with MFA required' using errcode = '42501';
  end if;
  if p_user_id = auth.uid() and p_sub_role = 'super_admin' then
    raise exception 'You cannot remove your own super admin role' using errcode = '42501';
  end if;
  delete from public.admin_roles where user_id = p_user_id and sub_role = p_sub_role;
  -- No admin role left: back to an ordinary account (buyer; selling needs a supplier application).
  if not exists (select 1 from public.admin_roles where user_id = p_user_id) then
    update public.profiles set role = 'buyer' where id = p_user_id and role = 'admin';
  end if;
  perform private.audit('admin.revoke', 'profiles', p_user_id::text, jsonb_build_object('sub_role', p_sub_role));
end $$;

-- ---------------------------------------------------------------- privileges

revoke execute on all functions in schema private from public, anon, authenticated;
revoke execute on function
  public.check_can_book_shipment(uuid),
  public.admin_reissue_refund(uuid, uuid),
  public.set_stock(uuid, uuid, integer, integer)
  from public, anon;
grant execute on function
  public.check_can_book_shipment(uuid),
  public.admin_reissue_refund(uuid, uuid),
  public.set_stock(uuid, uuid, integer, integer)
  to authenticated;
