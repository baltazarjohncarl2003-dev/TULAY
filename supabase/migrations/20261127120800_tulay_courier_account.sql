-- Owner decision 2026-11-27: courier orders ship on TULAY's own Ninja Van account (one account, not one per
-- supplier), the buyer pays the shipping fee, and COD stays off.
--  * One TULAY access token in Vault replaces the per-supplier OAuth connections and tokens.
--  * Booking on TULAY's account moves the order's shipping fee from the supplier to courier_payable, because
--    TULAY pays Ninja Van. A manual shipment (the supplier's own courier) leaves the fee with the supplier.
--  * record_shipment is service-role only: a supplier could otherwise register any tracking number as a booking.

-- ---------------------------------------------------------------- TULAY's courier token

create table private.platform_courier_tokens (
  carrier text primary key check (carrier in ('ninjavan')),
  secret_id uuid not null, -- vault.secrets row: {"access_token": ...}
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);
create trigger platform_courier_tokens_touch before update on private.platform_courier_tokens
  for each row execute function private.touch_updated_at();

-- Service role (booking server): store TULAY's access token and its expiry (Ninja Van audit: cache both).
create function public.courier_save_platform_token(p_carrier text, p_access_token text, p_expires_at timestamptz) returns void
language plpgsql security definer set search_path = '' as $$
declare
  t private.platform_courier_tokens;
  secret text := jsonb_build_object('access_token', p_access_token)::text;
begin
  if coalesce(p_access_token, '') = '' or p_expires_at is null then
    raise exception 'Missing token' using errcode = '22023';
  end if;
  -- Two bookings refreshing at once must not both create the Vault secret.
  perform pg_advisory_xact_lock(hashtext('courier_platform_token:' || coalesce(p_carrier, '')));
  select * into t from private.platform_courier_tokens where carrier = p_carrier;
  if t.secret_id is null then
    insert into private.platform_courier_tokens (carrier, secret_id, expires_at)
    values (p_carrier, vault.create_secret(secret, 'courier:' || p_carrier || ':tulay'), p_expires_at);
  else
    perform vault.update_secret(t.secret_id, secret);
    update private.platform_courier_tokens set expires_at = p_expires_at where carrier = p_carrier;
  end if;
end $$;

-- Service role: TULAY's saved token (no row before the first one).
create function public.courier_load_platform_token(p_carrier text)
returns table (access_token text, expires_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select (d.decrypted_secret::jsonb) ->> 'access_token', t.expires_at
  from private.platform_courier_tokens t
  join vault.decrypted_secrets d on d.id = t.secret_id
  where t.carrier = p_carrier;
$$;

-- ---------------------------------------------------------------- per-supplier connections (removed)

delete from vault.secrets where id in (select secret_id from private.courier_tokens);
drop function public.courier_save_tokens(uuid, text, text, text, timestamptz, text);
drop function public.courier_load_tokens(uuid, text);
drop function public.disconnect_courier(text);
drop table private.courier_tokens;
drop table public.courier_connections;

-- ---------------------------------------------------------------- booking on TULAY's account

-- Server only, after the supplier passed check_can_book_shipment and the courier accepted the booking.
-- TULAY pays the courier, so the shipping fee the buyer paid moves from the supplier to courier_payable.
-- One shipment per order (unique order_id), so the fee moves once.
create or replace function public.record_shipment(p_order_id uuid, p_carrier text, p_tracking_ref text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  o public.orders;
  sid uuid;
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
  insert into public.shipments (order_id, carrier, tracking_ref, cod_amount_centavos)
  values (o.id, p_carrier, btrim(p_tracking_ref),
    case when o.payment_option = 'cod' then o.total_centavos - o.paid_online_centavos else 0 end)
  returning id into sid;
  perform private.post(txn, 'supplier_payable', o.shipping_centavos, 0, 'Shipping fee to TULAY (courier booked)', o.supplier_id, o.id);
  perform private.post(txn, 'courier_payable', 0, o.shipping_centavos, 'Shipping fee (courier booked)', o.supplier_id, o.id);
  perform private.audit('order.shipment', 'shipments', sid::text,
    jsonb_build_object('order_id', o.id, 'carrier', p_carrier, 'shipping_centavos', o.shipping_centavos));
  return sid;
end $$;

-- ---------------------------------------------------------------- COD

update public.platform_settings set description = 'Largest COD order in centavos. 0 = COD off. Keep 0 while courier orders '
  || 'ship on TULAY''s own Ninja Van account: Ninja Van would pay the COD cash to TULAY, not the supplier.'
where key = 'cod_max_order_centavos';

-- ---------------------------------------------------------------- privileges

revoke all on private.platform_courier_tokens from public, anon, authenticated;
alter table private.platform_courier_tokens enable row level security; -- no policies: service role and definer functions only

revoke execute on all functions in schema private from public, anon, authenticated;
revoke execute on function
  public.courier_save_platform_token(text, text, timestamptz),
  public.courier_load_platform_token(text),
  public.record_shipment(uuid, text, text)
  from public, anon, authenticated;
grant execute on function
  public.courier_save_platform_token(text, text, timestamptz),
  public.courier_load_platform_token(text),
  public.record_shipment(uuid, text, text)
  to service_role;
