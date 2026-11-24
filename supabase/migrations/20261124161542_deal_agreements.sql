-- Agreement and checkout for deals negotiated in a chat (owner's master prompt, 2026-11-24; owner's decisions:
-- terms drafted per return class pending legal review, BOTH parties confirm, payments stay on PayMongo).
--
-- 1. After an offer is accepted, the buyer sets the delivery address and the supplier sets the return class.
--    Each change is a new agreement version (append-only); both parties confirm one exact version.
-- 2. The buyer pays the agreed downpayment online; that creates the order (payment option 'split', status
--    'confirmed' = accepted with a balance due). Below the downpayment rule (0%) or at 100% the order is paid in full.
-- 3. The balance is a second online checkout on the same order; nothing ships until it is paid.

alter type public.payment_option add value if not exists 'split'; -- downpayment online now, balance online before shipping

-- ---------------------------------------------------------------- terms per return class

-- Admin-edited terms shown on agreements. An agreement keeps its own copy, so editing never changes agreed terms.
create table public.terms_templates (
  return_class public.return_class primary key,
  version integer not null default 1 check (version >= 1),
  body text not null check (char_length(body) between 1 and 5000),
  updated_at timestamptz not null default now(),
  updated_by uuid
);

insert into public.terms_templates (return_class, body) values
('standard', $t$DRAFT, pending legal review.

Standard items (ready-made stock goods).
1. Price, quantity, shipping fee, downpayment and balance are as agreed in the accepted offer and cannot change without a new offer accepted by both parties.
2. The buyer may cancel before the order ships; any amount paid is refunded to the original payment method.
3. Unused items in their original condition may be returned within the return window shown on the order.
4. Transit damage, wrong or missing items must be reported within the damage window shown on the order, with photos.
5. The balance must be paid online before the order ships.$t$),
('custom', $t$DRAFT, pending legal review.

Custom-made items (printed, customised or made to order).
1. Price, quantity, shipping fee, downpayment and balance are as agreed in the accepted offer and cannot change without a new offer accepted by both parties.
2. Production follows artwork, then a proof, then the buyer's approval of the proof. The approved proof is kept as the record of what was ordered.
3. The buyer may cancel until the proof is approved; the downpayment is then refunded. After approval the order cannot be cancelled and the downpayment is kept, because the goods are being made.
4. Custom items cannot be returned for a change of mind. Print defects (peeling, cracking, fading) and items that do not match the approved proof must be reported within the defect window shown on the order, for a reprint or refund.
5. The balance must be paid online before the order ships.$t$),
('final_sale', $t$DRAFT, pending legal review.

Final sale items (clearance and sample lots).
1. Price, quantity, shipping fee, downpayment and balance are as agreed in the accepted offer and cannot change without a new offer accepted by both parties.
2. The order cannot be cancelled after payment.
3. No returns, except for a wrong or damaged item reported within the damage window shown on the order, with photos.
4. The balance must be paid online before the order ships.$t$);

-- ---------------------------------------------------------------- agreements

create table public.deal_agreements (
  seq bigint generated always as identity unique,
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.direct_conversations (id),
  accept_id uuid not null references public.chat_offers (id), -- the accepted offer (an 'accept' row)
  version integer not null check (version >= 1),
  return_class public.return_class, -- set by the supplier; null until then
  terms_version integer,
  terms_body text check (char_length(terms_body) <= 5000),
  ship_to jsonb, -- the buyer's delivery address, frozen; null until set
  created_by uuid not null,
  created_at timestamptz not null default now(),
  unique (accept_id, version),
  check ((return_class is null) = (terms_body is null) and (terms_body is null) = (terms_version is null))
);
create index deal_agreements_chat_idx on public.deal_agreements (conversation_id, seq);
create trigger deal_agreements_append_only before update or delete on public.deal_agreements
  for each row execute function private.forbid_change();

create table public.deal_agreement_confirmations (
  agreement_id uuid not null references public.deal_agreements (id),
  party_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (agreement_id, party_id)
);
create trigger deal_agreement_confirmations_append_only before update or delete on public.deal_agreement_confirmations
  for each row execute function private.forbid_change();

-- The order a deal became (downpayment checkout), and the checkout that pays an order's balance.
alter table public.orders add column agreement_id uuid references public.deal_agreements (id);
create unique index orders_one_live_per_agreement on public.orders (agreement_id) where agreement_id is not null and status <> 'cancelled';
alter table public.checkouts add column order_id uuid references public.orders (id);
create unique index checkouts_one_open_balance on public.checkouts (order_id) where order_id is not null and status = 'pending';

-- The accepted offer an agreement belongs to, its chat locked, the caller checked as a party.
create function private.agreement_offer(p_uid uuid, p_accept_id uuid) returns public.chat_offers
language plpgsql security definer set search_path = '' as $$
declare a public.chat_offers;
begin
  select * into a from public.chat_offers where id = p_accept_id and action = 'accept';
  if a.id is null then
    raise exception 'Accepted offer not found' using errcode = 'P0002';
  end if;
  perform private.offer_chat(p_uid, a.conversation_id); -- locks the chat; refuses outsiders and unverified suppliers
  return a;
end $$;

-- True once this accepted offer has a live order (any agreement version): its agreement can no longer change.
create function private.agreement_ordered(p_accept_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.orders o join public.deal_agreements g on g.id = o.agreement_id
                 where g.accept_id = p_accept_id and o.status <> 'cancelled');
$$;

-- Either party: the buyer sets the delivery address (p_address_id, one of their saved addresses), the supplier sets
-- the return class. Anything not passed carries over. Writes a new version only when something changed and returns
-- the latest version's id. A new version needs both confirmations again.
create function public.update_agreement(p_accept_id uuid, p_address_id uuid, p_return_class public.return_class)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_user();
  a public.chat_offers;
  c public.direct_conversations;
  prev public.deal_agreements;
  t public.terms_templates;
  ship jsonb;
  cls public.return_class;
  body text;
  tver integer;
  new_id uuid;
begin
  a := private.agreement_offer(uid, p_accept_id);
  select * into c from public.direct_conversations where id = a.conversation_id;
  if private.agreement_ordered(a.id) then
    raise exception 'This deal already has an order; its details can no longer change' using errcode = '22023';
  end if;
  if p_address_id is not null and uid <> c.buyer_id then
    raise exception 'Only the buyer sets the delivery address' using errcode = '42501';
  end if;
  if p_return_class is not null and uid = c.buyer_id then
    raise exception 'Only the supplier sets the return class' using errcode = '42501';
  end if;
  select * into prev from public.deal_agreements where accept_id = a.id order by version desc limit 1;

  ship := coalesce(private.ship_to(p_address_id, uid, false), prev.ship_to);
  cls := coalesce(p_return_class, prev.return_class);
  if cls is not distinct from prev.return_class then
    body := prev.terms_body;
    tver := prev.terms_version;
  elsif cls is not null then
    select * into t from public.terms_templates where return_class = cls;
    body := t.body;
    tver := t.version;
  end if;
  if prev.id is not null and ship is not distinct from prev.ship_to and cls is not distinct from prev.return_class then
    return prev.id; -- nothing changed: a retry or a double click
  end if;

  insert into public.deal_agreements (conversation_id, accept_id, version, return_class, terms_version, terms_body, ship_to, created_by)
  values (c.id, a.id, coalesce(prev.version, 0) + 1, cls, tver, body, ship, uid)
  returning id into new_id;
  perform private.notify(case when uid = c.buyer_id then (select owner_id from public.suppliers where id = c.supplier_id) else c.buyer_id end,
    'Order details updated', 'Review and confirm the order details for offer #' || a.revision || '.', '/messages?c=' || c.id);
  perform private.audit('agreement.update', 'deal_agreements', new_id::text,
    jsonb_build_object('accept_id', a.id, 'return_class', cls, 'has_address', ship is not null));
  return new_id;
end $$;

-- Either party: confirms one exact, complete, latest agreement version. Idempotent.
create function public.confirm_agreement(p_agreement_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_user();
  g public.deal_agreements;
  c public.direct_conversations;
  owner uuid;
begin
  select * into g from public.deal_agreements where id = p_agreement_id;
  if g.id is null then
    raise exception 'Order details not found' using errcode = 'P0002';
  end if;
  perform private.agreement_offer(uid, g.accept_id); -- lock + party check
  if exists (select 1 from public.deal_agreements where accept_id = g.accept_id and version > g.version) then
    raise exception 'The order details changed. Review the latest version.' using errcode = '22023';
  end if;
  if g.ship_to is null or g.return_class is null then
    raise exception 'The order details are not complete yet' using errcode = '22023';
  end if;
  insert into public.deal_agreement_confirmations (agreement_id, party_id) values (g.id, uid) on conflict do nothing;
  if not found then
    return;
  end if;
  select * into c from public.direct_conversations where id = g.conversation_id;
  select owner_id into owner from public.suppliers where id = c.supplier_id;
  if (select count(*) from public.deal_agreement_confirmations where agreement_id = g.id) = 2 then
    perform private.notify(c.buyer_id, 'Ready to pay', 'Both parties confirmed the order details. You can pay the downpayment now.',
      '/messages?c=' || c.id);
    perform private.notify(owner, 'Order details confirmed', 'Both parties confirmed. The buyer can pay now.', '/messages?c=' || c.id);
  else
    perform private.notify(case when uid = c.buyer_id then owner else c.buyer_id end, 'Please confirm the order details',
      'The other party confirmed the order details. Your confirmation is needed.', '/messages?c=' || c.id);
  end if;
  perform private.audit('agreement.confirm', 'deal_agreements', g.id::text, jsonb_build_object('version', g.version));
end $$;

-- Buyer: pays for a deal both parties confirmed. Creates the order at the accepted offer's exact terms and a
-- checkout for what is due now: the agreed downpayment (payment option 'split'), or the full total when the agreed
-- downpayment is 0% or 100%. A retry with the same key returns the same checkout.
create function public.start_agreement_checkout(p_agreement_id uuid, p_idempotency_key uuid, p_method public.payment_method)
returns table (checkout_id uuid, amount_centavos bigint)
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_user();
  g public.deal_agreements;
  a public.chat_offers;
  c public.direct_conversations;
  co public.checkouts;
  split boolean;
  due bigint;
  total bigint;
begin
  if p_idempotency_key is null then
    raise exception 'Idempotency key required' using errcode = '22023';
  end if;
  select * into co from public.checkouts x where x.buyer_id = uid and x.idempotency_key = p_idempotency_key;
  if co.id is not null then
    return query select co.id, co.total_centavos;
    return;
  end if;
  select * into g from public.deal_agreements where id = p_agreement_id;
  if g.id is null then
    raise exception 'Order details not found' using errcode = 'P0002';
  end if;
  a := private.agreement_offer(uid, g.accept_id); -- locks the chat, so two checkouts cannot start at once
  select * into c from public.direct_conversations where id = g.conversation_id;
  if uid <> c.buyer_id then
    raise exception 'Only the buyer pays for the order' using errcode = '42501';
  end if;
  if exists (select 1 from public.deal_agreements where accept_id = g.accept_id and version > g.version) then
    raise exception 'The order details changed. Review the latest version.' using errcode = '22023';
  end if;
  if (select count(*) from public.deal_agreement_confirmations where agreement_id = g.id) < 2 then
    raise exception 'Both parties must confirm the order details first' using errcode = '22023';
  end if;
  if private.agreement_ordered(a.id) then
    raise exception 'This deal already has an order' using errcode = '22023';
  end if;
  if not exists (select 1 from public.suppliers where id = c.supplier_id and status = 'verified') then
    raise exception 'This supplier cannot take orders right now' using errcode = '22023';
  end if;

  split := a.downpayment_centavos > 0 and a.downpayment_centavos < a.total_centavos;
  due := case when split then a.downpayment_centavos else a.total_centavos end;
  insert into public.checkouts (buyer_id, method, total_centavos, idempotency_key, expires_at)
  values (uid, p_method, due, p_idempotency_key, now() + make_interval(mins => coalesce(private.setting_int('checkout_ttl_minutes'), 15)))
  returning * into co;
  total := private.create_orders(co.id, uid, jsonb_build_array(jsonb_build_object(
      'supplierId', c.supplier_id, 'productId', '', 'variantId', '', 'title', a.product_name, 'variantName', a.product_type,
      'unit', a.unit, 'quantity', a.quantity, 'unitPrice', a.unit_price_centavos,
      'bps', public.commission_rate_bps(null, now()), 'returnClass', g.return_class)),
    0, a.shipping_fee_centavos, 'courier', g.ship_to, 'online');
  if total <> a.total_centavos then
    raise exception 'Deal amount mismatch' using errcode = 'XX000';
  end if;
  -- create_orders knows only online and COD; a split order is online with the agreed downpayment due first.
  update public.orders x set agreement_id = g.id,
    payment_option = case when split then 'split' else 'online' end::public.payment_option,
    downpayment_centavos = case when split then a.downpayment_centavos else 0 end
  where x.checkout_id = co.id;
  insert into public.payments (checkout_id, method, amount_centavos) values (co.id, p_method, due);
  perform private.audit('checkout.start', 'checkouts', co.id::text,
    jsonb_build_object('agreement_id', g.id, 'due_centavos', due, 'total_centavos', total, 'split', split));
  return query select co.id, due;
end $$;

-- Buyer: pays the rest of a split order. One open balance checkout per order; a retry with the same key returns it.
create function public.start_balance_checkout(p_order_id uuid, p_idempotency_key uuid, p_method public.payment_method)
returns table (checkout_id uuid, amount_centavos bigint)
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_user();
  o public.orders;
  co public.checkouts;
  due bigint;
begin
  if p_idempotency_key is null then
    raise exception 'Idempotency key required' using errcode = '22023';
  end if;
  select * into co from public.checkouts x where x.buyer_id = uid and x.idempotency_key = p_idempotency_key;
  if co.id is not null then
    return query select co.id, co.total_centavos;
    return;
  end if;
  select * into o from public.orders where id = p_order_id and buyer_id = uid for update;
  if o.id is null then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;
  if o.payment_option <> 'split' or o.status in ('pending_payment', 'cancelled') then
    raise exception 'This order has no balance to pay' using errcode = '22023';
  end if;
  due := o.total_centavos - o.paid_online_centavos;
  if due <= 0 then
    raise exception 'This order is fully paid' using errcode = '22023';
  end if;
  if exists (select 1 from public.checkouts x where x.order_id = o.id and x.status = 'pending') then
    raise exception 'A balance payment is already open. Finish it, or wait a few minutes and try again.' using errcode = '22023';
  end if;
  insert into public.checkouts (buyer_id, method, total_centavos, idempotency_key, expires_at, order_id)
  values (uid, p_method, due, p_idempotency_key, now() + make_interval(mins => coalesce(private.setting_int('checkout_ttl_minutes'), 15)), o.id)
  returning * into co;
  insert into public.payments (checkout_id, method, amount_centavos) values (co.id, p_method, due);
  perform private.audit('checkout.balance', 'checkouts', co.id::text, jsonb_build_object('order_id', o.id, 'due_centavos', due));
  return query select co.id, due;
end $$;

-- Supplier: reminds the buyer to pay the balance (for example when the order is ready to ship).
create function public.request_balance(p_order_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare o public.orders := private.my_order(p_order_id, 'supplier');
begin
  if o.payment_option <> 'split' or o.status = 'cancelled' or o.paid_online_centavos >= o.total_centavos then
    raise exception 'This order has no balance to pay' using errcode = '22023';
  end if;
  perform private.notify(o.buyer_id, 'Balance due', o.ref || ': please pay the balance of '
    || private.php(o.total_centavos - o.paid_online_centavos) || ' so the order can ship.', '/buyer/orders/' || o.id);
  perform private.audit('order.request_balance', 'orders', o.id::text);
end $$;

-- ---------------------------------------------------------------- settlement (replaces the Stage 5 versions)

-- Same as before, plus: a split order counts its downpayment as paid and becomes 'confirmed' (balance due);
-- a balance checkout (order_id set) adds to the order it pays, with no second commission.
create or replace function private.confirm_checkout(p_checkout_id uuid, p_payment_id uuid, p_fee bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare
  co public.checkouts;
  o public.orders;
  paid bigint;
  share bigint;
  given bigint := 0;
  first_order uuid;
begin
  select * into co from public.checkouts where id = p_checkout_id for update;
  update public.checkouts set status = 'paid' where id = co.id;

  if co.order_id is not null then
    -- Balance of a split order: commission was recognised with the downpayment, so none is charged again.
    update public.orders set paid_online_centavos = paid_online_centavos + co.total_centavos,
      gateway_fee_centavos = gateway_fee_centavos + p_fee
    where id = co.order_id returning * into o;
    o.commission_centavos := 0;
    perform private.post_order_paid(o, co.total_centavos, p_fee, p_payment_id);
    perform private.audit('order.balance_paid', 'orders', o.id::text, jsonb_build_object('amount_centavos', co.total_centavos));
    perform private.notify(s.owner_id, 'Balance paid', o.ref || ' is fully paid and can ship.', '/supplier/orders/' || o.id)
    from public.suppliers s where s.id = o.supplier_id;
    perform private.notify(co.buyer_id, 'Balance paid', o.ref || ' is fully paid. Thank you.', '/buyer/orders/' || o.id);
    return;
  end if;

  -- Gateway fee split by the amount each order paid online (largest takes the rounding remainder).
  for o in select * from public.orders where checkout_id = co.id order by
    (case when payment_option in ('cod', 'split') then downpayment_centavos else total_centavos end) desc, id
  loop
    paid := case when o.payment_option in ('cod', 'split') then o.downpayment_centavos else o.total_centavos end;
    share := case when co.total_centavos > 0 then (p_fee * paid) / co.total_centavos else 0 end;
    if first_order is null then
      first_order := o.id;
    end if;
    update public.orders set gateway_fee_centavos = share, paid_online_centavos = paid where id = o.id;
    given := given + share;
  end loop;
  update public.orders set gateway_fee_centavos = gateway_fee_centavos + (p_fee - given) where id = first_order;

  for o in select * from public.orders where checkout_id = co.id loop
    perform private.set_order_status(o.id,
      case when o.payment_option in ('cod', 'split') then 'confirmed' else 'paid' end::public.order_status,
      case o.payment_option when 'cod' then 'COD order confirmed' when 'split' then 'Downpayment paid' else 'Payment confirmed' end);
    update public.orders set paid_at = now() where id = o.id;
    perform private.post_order_paid(o, o.paid_online_centavos, o.gateway_fee_centavos, p_payment_id);
    perform private.notify(s.owner_id, 'New order', o.ref || ' is ready for you.', '/supplier/orders/' || o.id)
    from public.suppliers s where s.id = o.supplier_id;
  end loop;
  update public.stock_reservations set status = 'converted' where checkout_id = co.id and status = 'active';
  delete from public.cart_items c
  where c.user_id = co.buyer_id and exists (
    select 1 from public.order_items i join public.orders x on x.id = i.order_id
    where x.checkout_id = co.id and i.product_id = c.product_id and i.variant_id is not distinct from c.variant_id);
  perform private.notify(co.buyer_id, 'Order confirmed', 'Thank you. Your order is confirmed.', '/buyer/orders');
end $$;

-- Ready to hand over (unchanged), and a split order ships only once its balance is paid.
create or replace function private.check_ready(o public.orders) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (o.status = 'in_production' or (o.status in ('paid', 'confirmed') and not private.is_custom(o.id))) then
    raise exception 'This order is not ready to ship' using errcode = '22023';
  end if;
  if o.payment_option = 'split' and o.paid_online_centavos < o.total_centavos then
    raise exception 'The buyer has not paid the balance yet' using errcode = '22023';
  end if;
end $$;

-- A cancelled order closes its open balance checkout (whoever cancelled it), so a payment arriving later is
-- flagged for review and refunded by confirm_payment instead of being added to a cancelled order.
create function private.close_balance_on_cancel() returns trigger
language plpgsql security definer set search_path = '' as $$
declare x uuid;
begin
  for x in select id from public.checkouts where order_id = new.id and status = 'pending' loop
    perform private.release_checkout(x, 'cancelled', 'Order cancelled');
  end loop;
  return null;
end $$;
create trigger orders_close_balance_on_cancel after update of status on public.orders
  for each row when (new.status = 'cancelled' and old.status <> 'cancelled') execute function private.close_balance_on_cancel();

-- Super admin: edits the terms for one return class. Agreements already made keep their own copy.
create function public.admin_update_terms(p_return_class public.return_class, p_body text) returns void
language plpgsql security definer set search_path = '' as $$
declare clean text := btrim(coalesce(p_body, ''));
begin
  if not public.has_admin_role('super_admin') then
    raise exception 'Super admin with MFA required' using errcode = '42501';
  end if;
  if char_length(clean) not between 1 and 5000 then
    raise exception 'Terms are 1 to 5000 characters' using errcode = '22023';
  end if;
  update public.terms_templates set body = clean, version = version + 1, updated_at = now(), updated_by = auth.uid()
  where return_class = p_return_class and body <> clean;
  if found then
    perform private.audit('terms.update', 'terms_templates', p_return_class::text);
  end if;
end $$;

-- Open chats refresh when the other party changes or confirms the details (RLS decides who receives each row).
alter publication supabase_realtime add table public.deal_agreements, public.deal_agreement_confirmations;

-- ---------------------------------------------------------------- privileges + RLS

revoke all on public.terms_templates, public.deal_agreements, public.deal_agreement_confirmations from anon, authenticated;
grant select on public.terms_templates, public.deal_agreements, public.deal_agreement_confirmations to authenticated;
alter table public.terms_templates enable row level security;
alter table public.deal_agreements enable row level security;
alter table public.deal_agreement_confirmations enable row level security;
create policy "terms_templates: everyone signed in" on public.terms_templates for select to authenticated using (true);
-- The subqueries run under direct_conversations' own policy: the two parties, or support.
create policy "deal_agreements: with visible conversation" on public.deal_agreements for select to authenticated
  using (conversation_id in (select id from public.direct_conversations));
create policy "deal_agreement_confirmations: with visible agreement" on public.deal_agreement_confirmations for select to authenticated
  using (agreement_id in (select id from public.deal_agreements));

revoke execute on all functions in schema private from public, anon, authenticated;
revoke execute on function
  public.update_agreement(uuid, uuid, public.return_class),
  public.confirm_agreement(uuid),
  public.start_agreement_checkout(uuid, uuid, public.payment_method),
  public.start_balance_checkout(uuid, uuid, public.payment_method),
  public.request_balance(uuid),
  public.admin_update_terms(public.return_class, text)
  from public, anon;
grant execute on function
  public.update_agreement(uuid, uuid, public.return_class),
  public.confirm_agreement(uuid),
  public.start_agreement_checkout(uuid, uuid, public.payment_method),
  public.start_balance_checkout(uuid, uuid, public.payment_method),
  public.request_balance(uuid),
  public.admin_update_terms(public.return_class, text)
  to authenticated;
