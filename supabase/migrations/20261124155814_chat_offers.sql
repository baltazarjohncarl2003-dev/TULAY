-- Offers and counteroffers inside a direct chat (owner's master prompt, 2026-11-24; owner's decisions the same day:
-- the shipping fee is part of the offer, the supplier sets the downpayment as a percentage, payments stay on PayMongo).
--
-- chat_offers is append-only. A proposal (action offer or counter) is one numbered revision with the full terms.
-- Every proposal is answered at most once, by a counter (which replaces it), accept, reject or withdraw; the answer
-- is its own row that copies the terms, so an accepted row alone records exactly what both parties agreed to.
-- A proposal is open while it has no answer and its valid_until has not passed. There is at most one open
-- proposal per chat, because a new proposal must answer (counter) the open one.

insert into public.platform_settings (key, value, description) values
  ('offer_valid_hours', '48', 'Hours an offer or counteroffer in a chat stays open before it expires.'),
  ('downpayment_min_order_centavos', '100000',
    'Orders with a total at or above this (in centavos) need a downpayment above 0% in the agreed offer. 100000 = PHP 1,000.');

create type public.chat_offer_action as enum ('offer', 'counter', 'accept', 'reject', 'withdraw');

create table public.chat_offers (
  seq bigint generated always as identity unique, -- creation order
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.direct_conversations (id),
  actor_id uuid not null,
  action public.chat_offer_action not null,
  revision integer not null check (revision >= 1), -- a proposal's number; an answer carries the number it answers
  related_offer_id uuid references public.chat_offers (id), -- the proposal answered (null for an offer with none open)
  product_name text not null check (char_length(product_name) between 1 and 160),
  product_type text not null default '' check (char_length(product_type) <= 80),
  specs text not null default '' check (char_length(specs) <= 1000),
  unit public.product_unit not null,
  quantity integer not null check (quantity between 1 and 10000000),
  unit_price_centavos bigint not null check (unit_price_centavos between 1 and 100000000000),
  shipping_fee_centavos bigint not null check (shipping_fee_centavos between 0 and 10000000000),
  lead_days integer not null check (lead_days between 1 and 365),
  downpayment_bps integer not null check (downpayment_bps between 0 and 10000),
  payment_terms text not null default '' check (char_length(payment_terms) <= 300),
  conditions text not null default '' check (char_length(conditions) <= 1000),
  subtotal_centavos bigint not null,
  total_centavos bigint not null,
  downpayment_centavos bigint not null,
  valid_until timestamptz not null,
  idempotency_key uuid not null,
  created_at timestamptz not null default now(),
  unique (actor_id, idempotency_key),
  check (subtotal_centavos = unit_price_centavos * quantity),
  check (total_centavos = subtotal_centavos + shipping_fee_centavos),
  check (downpayment_centavos between 0 and total_centavos),
  check ((action = 'offer') = (related_offer_id is null))
);
create index chat_offers_thread_idx on public.chat_offers (conversation_id, seq);
-- A proposal is answered at most once, whoever races for it.
create unique index chat_offers_one_answer on public.chat_offers (related_offer_id) where related_offer_id is not null;
create trigger chat_offers_append_only before update or delete on public.chat_offers
  for each row execute function private.forbid_change();

-- Offer events show in the chat timeline as messages that point at their chat_offers row.
alter table public.direct_messages
  drop constraint direct_messages_kind_check,
  drop constraint direct_messages_payload_kind,
  add constraint direct_messages_kind_check check (kind in ('text', 'rfq', 'offer')),
  add constraint direct_messages_payload_kind check ((kind = 'text') = (payload is null));

-- Same contract; offer events get their own notification title.
create or replace function private.post_direct_message(
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
  title text := case p_kind when 'rfq' then 'New request for quotation' when 'offer' then 'Offer update' else 'New message' end;
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

-- "₱1,234.50" for message previews and notifications (the cards format amounts themselves).
create function private.peso(p_centavos bigint) returns text
language sql immutable set search_path = '' as $$
  select '₱' || to_char(p_centavos / 100.0, 'FM999,999,999,990.00');
$$;

-- The chat for an offer action: locked, with the caller checked as one of its two parties.
-- A supplier acts only while verified.
create function private.offer_chat(p_uid uuid, p_conversation_id uuid) returns public.direct_conversations
language plpgsql security definer set search_path = '' as $$
declare
  c public.direct_conversations;
  s public.suppliers;
begin
  select * into c from public.direct_conversations where id = p_conversation_id for update;
  select * into s from public.suppliers where id = c.supplier_id;
  if c.id is null or p_uid not in (c.buyer_id, s.owner_id) then
    raise exception 'Conversation not found' using errcode = 'P0002';
  end if;
  if p_uid = s.owner_id and s.status <> 'verified' then
    raise exception 'Only approved suppliers can make offers' using errcode = '42501';
  end if;
  return c;
end $$;

-- The chat's open proposal (no answer yet and not expired), or an empty row.
create function private.open_offer(p_conversation_id uuid) returns public.chat_offers
language sql stable security definer set search_path = '' as $$
  select o.* from public.chat_offers o
  where o.conversation_id = p_conversation_id
    and o.action in ('offer', 'counter')
    and o.valid_until > now()
    and not exists (select 1 from public.chat_offers a where a.related_offer_id = o.id)
  order by o.seq desc limit 1;
$$;

-- Either party: a new offer, or a counter to the other party's open offer (p_related_offer_id = that offer).
-- Pass p_related_offer_id null only when no offer is open. Money is integer centavos; downpayment in basis points
-- (5000 = 50%). Returns the new offer's id; a retry with the same key returns it again.
create function public.make_chat_offer(
  p_conversation_id uuid,
  p_related_offer_id uuid,
  p_product_name text,
  p_product_type text,
  p_specs text,
  p_unit public.product_unit,
  p_quantity integer,
  p_unit_price_centavos bigint,
  p_shipping_fee_centavos bigint,
  p_lead_days integer,
  p_downpayment_bps integer,
  p_payment_terms text,
  p_conditions text,
  p_idempotency_key uuid
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_user();
  c public.direct_conversations;
  open_ public.chat_offers;
  o public.chat_offers;
  existing uuid;
  name text := btrim(coalesce(p_product_name, ''));
  kind_ text := btrim(coalesce(p_product_type, ''));
  specs text := btrim(coalesce(p_specs, ''));
  terms text := btrim(coalesce(p_payment_terms, ''));
  conds text := btrim(coalesce(p_conditions, ''));
  ship bigint := coalesce(p_shipping_fee_centavos, 0);
  total bigint;
begin
  if p_idempotency_key is null then
    raise exception 'Please reload and try again' using errcode = '22023';
  end if;
  select id into existing from public.chat_offers where actor_id = uid and idempotency_key = p_idempotency_key;
  if existing is not null then
    return existing;
  end if;

  c := private.offer_chat(uid, p_conversation_id);
  open_ := private.open_offer(c.id);
  if open_.id is not null then
    if open_.actor_id = uid then
      raise exception 'Your offer is still open. Withdraw it first to change it.' using errcode = '22023';
    end if;
    if p_related_offer_id is distinct from open_.id then
      raise exception 'The other party changed the offer. Reload to see the latest one.' using errcode = '22023';
    end if;
  elsif p_related_offer_id is not null then
    raise exception 'That offer is no longer open. Reload to see the latest one.' using errcode = '22023';
  end if;

  if char_length(name) not between 1 and 160 then
    raise exception 'Name the product' using errcode = '22023';
  end if;
  if char_length(kind_) > 80 or char_length(specs) > 1000 or char_length(terms) > 300 or char_length(conds) > 1000 then
    raise exception 'One of the text fields is too long' using errcode = '22023';
  end if;
  if p_unit is null then
    raise exception 'Pick a unit' using errcode = '22023';
  end if;
  if p_quantity is null or p_quantity not between 1 and 10000000 then
    raise exception 'Enter a quantity from 1 to 10,000,000' using errcode = '22023';
  end if;
  if p_unit_price_centavos is null or p_unit_price_centavos not between 1 and 100000000000 then
    raise exception 'Enter a price per unit above zero' using errcode = '22023';
  end if;
  if ship not between 0 and 10000000000 then
    raise exception 'Enter a shipping fee of zero or more' using errcode = '22023';
  end if;
  if p_lead_days is null or p_lead_days not between 1 and 365 then
    raise exception 'Enter a lead time from 1 to 365 days' using errcode = '22023';
  end if;
  if p_downpayment_bps is null or p_downpayment_bps not between 0 and 10000 then
    raise exception 'The downpayment is from 0%% to 100%%' using errcode = '22023';
  end if;
  total := p_unit_price_centavos * p_quantity + ship;
  if total >= private.setting_int('downpayment_min_order_centavos') and p_downpayment_bps = 0 then
    raise exception 'Orders of % or more need a downpayment above 0%%',
      private.peso(private.setting_int('downpayment_min_order_centavos')) using errcode = '22023';
  end if;

  insert into public.chat_offers (conversation_id, actor_id, action, revision, related_offer_id, product_name, product_type,
    specs, unit, quantity, unit_price_centavos, shipping_fee_centavos, lead_days, downpayment_bps, payment_terms, conditions,
    subtotal_centavos, total_centavos, downpayment_centavos, valid_until, idempotency_key)
  values (c.id, uid, case when open_.id is null then 'offer' else 'counter' end::public.chat_offer_action,
    coalesce((select max(revision) from public.chat_offers where conversation_id = c.id), 0) + 1, open_.id, name, kind_,
    specs, p_unit, p_quantity, p_unit_price_centavos, ship, p_lead_days, p_downpayment_bps, terms, conds,
    p_unit_price_centavos * p_quantity, total, private.bps_of(total, p_downpayment_bps),
    now() + make_interval(hours => private.setting_int('offer_valid_hours')), p_idempotency_key)
  returning * into o;

  perform private.post_direct_message(c, uid, 'offer',
    case when o.action = 'counter' then 'Counteroffer' else 'Offer' end || ' #' || o.revision || ': ' || o.quantity || ' '
      || o.unit::text || ' at ' || private.peso(o.unit_price_centavos) || ', total ' || private.peso(o.total_centavos),
    jsonb_build_object('offerId', o.id), null, p_idempotency_key);
  perform private.audit('offer.' || o.action::text, 'chat_offers', o.id::text,
    jsonb_build_object('conversation_id', c.id, 'revision', o.revision, 'total_centavos', o.total_centavos));
  return o.id;
end $$;

-- Answers the chat's open offer: p_action 'accept' or 'reject' (the other party) or 'withdraw' (its author).
-- p_offer_id must be the open offer itself, so an outdated, answered or expired revision is refused.
-- Returns the answer's id; a retry with the same key returns it again.
create function public.respond_chat_offer(p_offer_id uuid, p_action text, p_idempotency_key uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_user();
  c public.direct_conversations;
  p public.chat_offers;
  o public.chat_offers;
  existing uuid;
  verb text;
begin
  if p_idempotency_key is null then
    raise exception 'Please reload and try again' using errcode = '22023';
  end if;
  if p_action is null or p_action not in ('accept', 'reject', 'withdraw') then
    raise exception 'Unknown action' using errcode = '22023';
  end if;
  select id into existing from public.chat_offers where actor_id = uid and idempotency_key = p_idempotency_key;
  if existing is not null then
    return existing;
  end if;

  select * into p from public.chat_offers where id = p_offer_id and action in ('offer', 'counter');
  if p.id is null then
    raise exception 'Offer not found' using errcode = 'P0002';
  end if;
  c := private.offer_chat(uid, p.conversation_id); -- locks the chat, so the checks below cannot race
  if exists (select 1 from public.chat_offers where related_offer_id = p.id) then
    raise exception 'This offer was already answered or replaced. Reload to see the latest one.' using errcode = '22023';
  end if;
  if p.valid_until <= now() then
    raise exception 'This offer has expired' using errcode = '22023';
  end if;
  if p_action = 'withdraw' and p.actor_id <> uid then
    raise exception 'Only the sender can withdraw an offer' using errcode = '42501';
  end if;
  if p_action in ('accept', 'reject') and p.actor_id = uid then
    raise exception 'You cannot answer your own offer' using errcode = '42501';
  end if;

  insert into public.chat_offers (conversation_id, actor_id, action, revision, related_offer_id, product_name, product_type,
    specs, unit, quantity, unit_price_centavos, shipping_fee_centavos, lead_days, downpayment_bps, payment_terms, conditions,
    subtotal_centavos, total_centavos, downpayment_centavos, valid_until, idempotency_key)
  values (c.id, uid, p_action::public.chat_offer_action, p.revision, p.id, p.product_name, p.product_type,
    p.specs, p.unit, p.quantity, p.unit_price_centavos, p.shipping_fee_centavos, p.lead_days, p.downpayment_bps,
    p.payment_terms, p.conditions, p.subtotal_centavos, p.total_centavos, p.downpayment_centavos, p.valid_until,
    p_idempotency_key)
  returning * into o;

  verb := case p_action when 'accept' then 'Accepted' when 'reject' then 'Rejected' else 'Withdrew' end;
  perform private.post_direct_message(c, uid, 'offer',
    verb || ' offer #' || p.revision || ': ' || p.quantity || ' ' || p.unit::text || ' at '
      || private.peso(p.unit_price_centavos) || ', total ' || private.peso(p.total_centavos),
    jsonb_build_object('offerId', o.id), null, p_idempotency_key);
  perform private.audit('offer.' || p_action, 'chat_offers', o.id::text,
    jsonb_build_object('conversation_id', c.id, 'revision', p.revision, 'offer_id', p.id, 'total_centavos', p.total_centavos));
  return o.id;
end $$;

-- ---------------------------------------------------------------- privileges + RLS

revoke all on public.chat_offers from anon, authenticated;
grant select on public.chat_offers to authenticated;
alter table public.chat_offers enable row level security;
-- The subquery runs under direct_conversations' own policy: the two parties, or support.
create policy "chat_offers: with visible conversation" on public.chat_offers for select to authenticated
  using (conversation_id in (select id from public.direct_conversations));

revoke execute on all functions in schema private from public, anon, authenticated;
revoke execute on function
  public.make_chat_offer(uuid, uuid, text, text, text, public.product_unit, integer, bigint, bigint, integer, integer, text, text, uuid),
  public.respond_chat_offer(uuid, text, uuid)
  from public, anon;
grant execute on function
  public.make_chat_offer(uuid, uuid, text, text, text, public.product_unit, integer, bigint, bigint, integer, integer, text, text, uuid),
  public.respond_chat_offer(uuid, text, uuid)
  to authenticated;
