-- QR Ph becomes a payment method and the one checkout offers first (cheapest for suppliers, owner 2026-11-17).
-- The gateway fee by method moves into private.gateway_fee so every caller and test uses one formula;
-- confirm_payment below is the 2026-11-15 version (audit_fixes) with only its fee line changed.

alter type public.payment_method add value if not exists 'qrph';

insert into public.platform_settings (key, value, description) values
  ('fee_qrph_bps', '134', 'QR Ph fee in basis points (134 = 1.34%), paid by the supplier.')
on conflict (key) do nothing;

-- Gateway fee in centavos for an amount paid with a method, from the admin fee settings.
create function private.gateway_fee(p_method public.payment_method, p_amount bigint) returns bigint
language sql stable security definer set search_path = '' as $$
  select case p_method::text
    when 'card' then private.bps_of(p_amount, private.setting_int('fee_card_bps')) + private.setting_int('fee_card_fixed_centavos')
    when 'ewallet' then private.bps_of(p_amount, private.setting_int('fee_ewallet_bps'))
    when 'qrph' then private.bps_of(p_amount, private.setting_int('fee_qrph_bps'))
    else private.bps_of(p_amount, private.setting_int('fee_online_banking_bps')) end;
$$;
revoke all on function private.gateway_fee(public.payment_method, bigint) from public, anon, authenticated;

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
  fee := coalesce(p_fee_centavos, private.gateway_fee(pay.method, pay.amount_centavos));

  if co.status <> 'pending' or p_amount_centavos is distinct from pay.amount_centavos then
    -- Close the checkout first so its orders are cancelled and its stock goes back on sale.
    perform private.release_checkout(co.id, 'cancelled', 'Payment did not match the checkout');
    update public.payments set status = 'needs_review', paid_at = now(), fee_centavos = fee where id = pay.id;
    txn := gen_random_uuid();
    perform private.post(txn, 'gateway_clearing', p_amount_centavos, 0, 'Unmatched payment', p_payment => pay.id);
    perform private.post(txn, 'unmatched_payments', 0, p_amount_centavos, 'Unmatched payment', p_payment => pay.id);
    -- private.notify_admins comes in the next migration; plpgsql resolves it when this runs.
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
