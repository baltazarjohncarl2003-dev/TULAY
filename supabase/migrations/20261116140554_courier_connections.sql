-- Courier accounts suppliers connect by OAuth (Ninja Van plugin model: each supplier books on its own
-- account, so COD cash goes to the supplier). Built before the permit against a local mock.
--  * courier_connections: status a supplier can see. No tokens here.
--  * private.courier_tokens: points at a Supabase Vault secret holding the tokens (encrypted at rest).
--    Only the service role reads or writes tokens, through the functions below.
--  * supplier_pickup_settings: sender address and default parcel weight used for bookings and waybills.

create table public.courier_connections (
  supplier_id uuid not null references public.suppliers (id),
  carrier text not null check (carrier in ('ninjavan')),
  status text not null default 'connected' check (status in ('connected', 'disconnected')),
  scopes text not null default '' check (char_length(scopes) <= 500),
  connected_at timestamptz not null default now(),
  disconnected_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (supplier_id, carrier)
);
create trigger courier_connections_touch before update on public.courier_connections
  for each row execute function private.touch_updated_at();

create table private.courier_tokens (
  supplier_id uuid not null,
  carrier text not null,
  secret_id uuid not null, -- vault.secrets row: {"access_token": ..., "refresh_token": ...}
  expires_at timestamptz not null,
  primary key (supplier_id, carrier),
  foreign key (supplier_id, carrier) references public.courier_connections (supplier_id, carrier)
);

create table public.supplier_pickup_settings (
  supplier_id uuid primary key references public.suppliers (id),
  sender_name text not null check (char_length(btrim(sender_name)) between 2 and 100),
  phone text not null check (phone ~ '^\+?[0-9 -]{7,20}$'),
  line1 text not null check (char_length(btrim(line1)) between 2 and 200),
  line2 text not null default '' check (char_length(line2) <= 200),
  barangay text not null default '' check (char_length(barangay) <= 100),
  city text not null check (char_length(btrim(city)) between 2 and 100),
  province text not null check (char_length(btrim(province)) between 2 and 100),
  postal_code text not null default '' check (postal_code ~ '^[0-9]{0,4}$'),
  parcel_weight_grams integer not null default 1000 check (parcel_weight_grams between 1 and 50000),
  updated_at timestamptz not null default now()
);
create trigger supplier_pickup_settings_touch before update on public.supplier_pickup_settings
  for each row execute function private.touch_updated_at();

-- The caller's verified supplier id, or an error.
create function private.my_verified_supplier() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare sid uuid;
begin
  perform private.require_user();
  select id into sid from public.suppliers where owner_id = auth.uid() and status = 'verified';
  if sid is null then
    raise exception 'Only a verified supplier can do this' using errcode = '42501';
  end if;
  return sid;
end $$;

-- Service role (OAuth callback and token refresh): store tokens. p_scopes null keeps the saved scopes.
create function public.courier_save_tokens(
  p_supplier_id uuid, p_carrier text, p_access_token text, p_refresh_token text, p_expires_at timestamptz, p_scopes text
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  t private.courier_tokens;
  secret text := jsonb_build_object('access_token', p_access_token, 'refresh_token', coalesce(p_refresh_token, ''))::text;
begin
  if coalesce(p_access_token, '') = '' or p_expires_at is null then
    raise exception 'Missing token' using errcode = '22023';
  end if;
  if not exists (select 1 from public.suppliers where id = p_supplier_id and status = 'verified') then
    raise exception 'Only a verified supplier can connect a courier' using errcode = '42501';
  end if;
  insert into public.courier_connections (supplier_id, carrier, scopes)
  values (p_supplier_id, p_carrier, coalesce(p_scopes, ''))
  on conflict (supplier_id, carrier) do update set
    status = 'connected',
    scopes = coalesce(p_scopes, public.courier_connections.scopes),
    connected_at = case when public.courier_connections.status = 'connected' then public.courier_connections.connected_at else now() end,
    disconnected_at = null;
  select * into t from private.courier_tokens where supplier_id = p_supplier_id and carrier = p_carrier;
  if t.secret_id is null then
    insert into private.courier_tokens (supplier_id, carrier, secret_id, expires_at)
    values (p_supplier_id, p_carrier, vault.create_secret(secret, 'courier:' || p_carrier || ':' || p_supplier_id), p_expires_at);
    perform private.audit('courier.connect', 'courier_connections', p_supplier_id::text, jsonb_build_object('carrier', p_carrier));
  else
    perform vault.update_secret(t.secret_id, secret);
    update private.courier_tokens set expires_at = p_expires_at where supplier_id = p_supplier_id and carrier = p_carrier;
  end if;
end $$;

-- Service role: the tokens of a connected account (no rows when not connected).
create function public.courier_load_tokens(p_supplier_id uuid, p_carrier text)
returns table (access_token text, refresh_token text, expires_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select (d.decrypted_secret::jsonb) ->> 'access_token', (d.decrypted_secret::jsonb) ->> 'refresh_token', t.expires_at
  from private.courier_tokens t
  join public.courier_connections c using (supplier_id, carrier)
  join vault.decrypted_secrets d on d.id = t.secret_id
  where t.supplier_id = p_supplier_id and t.carrier = p_carrier and c.status = 'connected';
$$;

-- Supplier: disconnect. Deletes the stored tokens; the connection row stays as history.
create function public.disconnect_courier(p_carrier text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  sid uuid := private.my_verified_supplier();
  secret_id uuid;
begin
  delete from private.courier_tokens where supplier_id = sid and carrier = p_carrier returning courier_tokens.secret_id into secret_id;
  if secret_id is not null then
    delete from vault.secrets where id = secret_id;
  end if;
  update public.courier_connections set status = 'disconnected', disconnected_at = now()
  where supplier_id = sid and carrier = p_carrier and status = 'connected';
  if found then
    perform private.audit('courier.disconnect', 'courier_connections', sid::text, jsonb_build_object('carrier', p_carrier));
  end if;
end $$;

-- Supplier: sender address and default parcel weight.
create function public.set_pickup_settings(
  p_sender_name text, p_phone text, p_line1 text, p_line2 text, p_barangay text, p_city text, p_province text,
  p_postal_code text, p_parcel_weight_grams integer
) returns void
language plpgsql security definer set search_path = '' as $$
declare sid uuid := private.my_verified_supplier();
begin
  insert into public.supplier_pickup_settings
    (supplier_id, sender_name, phone, line1, line2, barangay, city, province, postal_code, parcel_weight_grams)
  values (sid, btrim(p_sender_name), btrim(p_phone), btrim(p_line1), btrim(coalesce(p_line2, '')), btrim(coalesce(p_barangay, '')),
    btrim(p_city), btrim(p_province), btrim(coalesce(p_postal_code, '')), p_parcel_weight_grams)
  on conflict (supplier_id) do update set
    sender_name = excluded.sender_name, phone = excluded.phone, line1 = excluded.line1, line2 = excluded.line2,
    barangay = excluded.barangay, city = excluded.city, province = excluded.province,
    postal_code = excluded.postal_code, parcel_weight_grams = excluded.parcel_weight_grams;
end $$;

-- ---------------------------------------------------------------- privileges + RLS

revoke all on public.courier_connections, public.supplier_pickup_settings from anon, authenticated;
revoke all on private.courier_tokens from public, anon, authenticated;
grant select on public.courier_connections, public.supplier_pickup_settings to authenticated;
alter table public.courier_connections enable row level security;
alter table public.supplier_pickup_settings enable row level security;
alter table private.courier_tokens enable row level security; -- no policies: service role and definer functions only

create policy "courier_connections: own or support" on public.courier_connections for select to authenticated using (
  supplier_id = (select public.my_supplier_id()) or (select public.has_admin_role('support'))
);
-- The waybill shows the sender, so the supplier and support read it; writes only through set_pickup_settings.
create policy "supplier_pickup_settings: own or support" on public.supplier_pickup_settings for select to authenticated using (
  supplier_id = (select public.my_supplier_id()) or (select public.has_admin_role('support'))
);

revoke execute on all functions in schema private from public, anon, authenticated;
revoke execute on function
  public.courier_save_tokens(uuid, text, text, text, timestamptz, text),
  public.courier_load_tokens(uuid, text),
  public.disconnect_courier(text),
  public.set_pickup_settings(text, text, text, text, text, text, text, text, integer)
  from public, anon, authenticated;
grant execute on function
  public.courier_save_tokens(uuid, text, text, text, timestamptz, text),
  public.courier_load_tokens(uuid, text)
  to service_role;
grant execute on function
  public.disconnect_courier(text),
  public.set_pickup_settings(text, text, text, text, text, text, text, text, integer)
  to authenticated;
