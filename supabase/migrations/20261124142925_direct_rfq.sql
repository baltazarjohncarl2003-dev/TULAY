-- Product-specific RFQs go straight to the supplier as a structured message in their private direct chat
-- (owner's master prompt, 2026-11-24). They never create a public.rfqs row or a request board post.
-- Messages and RFQ threads are also published to Realtime so open chats update without a reload; RLS still
-- decides who receives each row.

alter table public.direct_messages
  add column kind text not null default 'text' check (kind in ('text', 'rfq')),
  -- The RFQ as the buyer sent it, frozen with the message (append-only) so it stands as evidence.
  add column payload jsonb check (payload is null or jsonb_typeof(payload) = 'object'),
  add column product_id uuid references public.products (id),
  add constraint direct_messages_payload_kind check ((kind = 'rfq') = (payload is not null));

-- The caller's conversation: an existing one by id (either party may continue it), or the buyer's
-- conversation with p_supplier_id, created on first use. A buyer's message refreshes the stored buyer name.
create function private.direct_conversation(p_uid uuid, p_conversation_id uuid, p_supplier_id uuid)
returns public.direct_conversations
language plpgsql security definer set search_path = '' as $$
declare
  c public.direct_conversations;
  s public.suppliers;
  p public.profiles;
begin
  if p_conversation_id is not null then
    select * into c from public.direct_conversations where id = p_conversation_id;
    select * into s from public.suppliers where id = c.supplier_id;
    if c.id is null or p_uid not in (c.buyer_id, s.owner_id) then
      raise exception 'Conversation not found' using errcode = 'P0002';
    end if;
  else
    select * into s from public.suppliers where id = p_supplier_id;
  end if;

  if c.id is null or p_uid = c.buyer_id then
    if s.id is null or s.status <> 'verified' then
      raise exception 'This supplier is not available for messages' using errcode = '22023';
    end if;
    if s.owner_id = p_uid then
      raise exception 'You cannot message your own business' using errcode = '22023';
    end if;
    select * into p from public.profiles where id = p_uid;
    if p.role = 'admin' then
      raise exception 'Admin accounts cannot start supplier chats' using errcode = '42501';
    end if;
    insert into public.direct_conversations (buyer_id, supplier_id, buyer_name)
    values (p_uid, s.id, coalesce(nullif(btrim(p.business_name), ''), nullif(btrim(p.full_name), ''), 'Buyer'))
    on conflict (buyer_id, supplier_id) do update set buyer_name = excluded.buyer_name
    returning * into c;
  end if;
  return c;
end $$;

-- Stores one message and notifies the other party. A repeated idempotency key stores nothing.
create function private.post_direct_message(
  c public.direct_conversations,
  p_uid uuid,
  p_kind text,
  p_body text,
  p_payload jsonb,
  p_product_id uuid,
  p_idempotency_key uuid
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  s public.suppliers;
  new_id bigint;
  title text := case when p_kind = 'rfq' then 'New request for quotation' else 'New message' end;
begin
  -- shortcut: no per-user message rate limit yet; add one (admin setting) before opening sign-ups widely.
  insert into public.direct_messages (conversation_id, sender_id, body, idempotency_key, kind, payload, product_id)
  values (c.id, p_uid, p_body, p_idempotency_key, p_kind, p_payload, p_product_id)
  on conflict (sender_id, idempotency_key) do nothing
  returning id into new_id;
  if new_id is null then
    return;
  end if;

  update public.direct_conversations set last_message_at = greatest(last_message_at, now()) where id = c.id;
  select * into s from public.suppliers where id = c.supplier_id;
  if p_uid = c.buyer_id then
    perform private.notify(s.owner_id, title, c.buyer_name || ': ' || left(p_body, 120), '/messages?c=' || c.id);
  else
    perform private.notify(c.buyer_id, title, s.business_name || ': ' || left(p_body, 120), '/messages?c=' || c.id);
  end if;
end $$;

-- Same contract as before; now built on the two helpers, and notifications open the chat itself.
create or replace function public.send_direct_message(
  p_conversation_id uuid,
  p_supplier_id uuid,
  p_body text,
  p_idempotency_key uuid
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_user();
  clean text := btrim(coalesce(p_body, ''));
  c public.direct_conversations;
  existing uuid;
begin
  if clean = '' or char_length(clean) > 2000 then
    raise exception 'Messages are 1 to 2000 characters' using errcode = '22023';
  end if;
  if p_idempotency_key is null then
    raise exception 'Please reload and try again' using errcode = '22023';
  end if;
  select conversation_id into existing from public.direct_messages
  where sender_id = uid and idempotency_key = p_idempotency_key;
  if existing is not null then
    return existing;
  end if;

  c := private.direct_conversation(uid, p_conversation_id, p_supplier_id);
  perform private.post_direct_message(c, uid, 'text', clean, null, null, p_idempotency_key);
  return c.id;
end $$;

-- Buyer: a request for quotation to one supplier, optionally about one of its live listings.
-- Opens (or reuses) the buyer's private chat with that supplier and posts the RFQ there as a card.
-- Returns the conversation id; a retry with the same key returns it again and stores nothing new.
create function public.send_direct_rfq(
  p_supplier_id uuid,
  p_product_id uuid,
  p_product_name text,
  p_product_type text,
  p_quantity integer,
  p_unit public.product_unit,
  p_target_price_centavos bigint,
  p_specs text,
  p_city text,
  p_province text,
  p_required_by date,
  p_notes text,
  p_idempotency_key uuid
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_user();
  existing uuid;
  pr public.products;
  c public.direct_conversations;
  name text;
  kind_ text := btrim(coalesce(p_product_type, ''));
  specs text := btrim(coalesce(p_specs, ''));
  notes text := btrim(coalesce(p_notes, ''));
  city text := btrim(coalesce(p_city, ''));
  province text := btrim(coalesce(p_province, ''));
begin
  if p_idempotency_key is null then
    raise exception 'Please reload and try again' using errcode = '22023';
  end if;
  select conversation_id into existing from public.direct_messages
  where sender_id = uid and idempotency_key = p_idempotency_key;
  if existing is not null then
    return existing;
  end if;

  if p_product_id is not null then
    select * into pr from public.products where id = p_product_id and supplier_id = p_supplier_id and status = 'approved';
    if pr.id is null then
      raise exception 'This product is not available' using errcode = '22023';
    end if;
    name := pr.title;
  else
    name := btrim(coalesce(p_product_name, ''));
  end if;

  if char_length(name) not between 1 and 160 then
    raise exception 'Name the product you need' using errcode = '22023';
  end if;
  if char_length(kind_) > 80 then
    raise exception 'Product type is too long' using errcode = '22023';
  end if;
  if p_quantity is null or p_quantity not between 1 and 10000000 then
    raise exception 'Enter a quantity from 1 to 10,000,000' using errcode = '22023';
  end if;
  if p_unit is null then
    raise exception 'Pick a unit' using errcode = '22023';
  end if;
  if p_target_price_centavos is not null and p_target_price_centavos not between 1 and 100000000000 then
    raise exception 'Enter a target price above zero' using errcode = '22023';
  end if;
  if char_length(specs) > 1000 or char_length(notes) > 1000 then
    raise exception 'Specifications and notes are up to 1000 characters each' using errcode = '22023';
  end if;
  if char_length(city) not between 1 and 100 or char_length(province) not between 1 and 100 then
    raise exception 'Enter the delivery city and province' using errcode = '22023';
  end if;
  if p_required_by is not null and p_required_by < private.manila_today() then
    raise exception 'The delivery date is in the past' using errcode = '22023';
  end if;

  -- Always the caller's own buyer-side chat with this supplier (never someone else's conversation).
  c := private.direct_conversation(uid, null, p_supplier_id);
  perform private.post_direct_message(c, uid, 'rfq',
    'RFQ: ' || name || ', ' || p_quantity || ' ' || p_unit::text,
    jsonb_build_object(
      'productName', name,
      'productType', kind_,
      'quantity', p_quantity,
      'unit', p_unit,
      'targetPriceCentavos', p_target_price_centavos,
      'specs', specs,
      'city', city,
      'province', province,
      'requiredBy', p_required_by,
      'notes', notes
    ),
    pr.id, p_idempotency_key);
  perform private.audit('rfq.direct', 'direct_conversations', c.id::text,
    jsonb_build_object('supplier_id', p_supplier_id, 'product_id', pr.id, 'quantity', p_quantity));
  return c.id;
end $$;

-- Live updates for open chats. Realtime applies each table's RLS before sending a row.
alter publication supabase_realtime add table public.direct_messages, public.rfq_messages;

revoke execute on all functions in schema private from public, anon, authenticated;
revoke execute on function
  public.send_direct_rfq(uuid, uuid, text, text, integer, public.product_unit, bigint, text, text, text, date, text, uuid)
  from public, anon;
grant execute on function
  public.send_direct_rfq(uuid, uuid, text, text, integer, public.product_unit, bigint, text, text, text, date, text, uuid)
  to authenticated;
