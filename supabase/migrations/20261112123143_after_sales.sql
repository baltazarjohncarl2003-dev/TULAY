-- Stage 6 After-sales: claims (damage / return / defect) inside the admin-set report windows, evidence,
-- supplier response, escalation to TULAY support, return authorisations, refunds (online through the
-- gateway; COD cash paid by the supplier directly and only recorded here), replacements, order
-- completion, reviews and the restocking fee.
--
-- Claim types and windows (days after delivery, platform_settings):
--   damage  report_window_damage_days  transit damage, wrong or missing items; any item
--   return  report_window_return_days  change of mind; standard items only; buyer pays the return; restocking fee
--   defect  report_window_defect_days  print defects (peeling, cracking, fading); custom items
--
-- Statuses: open -> (supplier) awaiting_return | refund_pending | replacement_pending | resolved | rejected
--           rejected / unanswered open -> (buyer) escalated -> (support) as accepted, or declined (final)
--           open | rejected -> (buyer) cancelled

insert into public.platform_settings (key, value, description) values
  ('claim_response_days', '3', 'Days a supplier has to answer a claim before the buyer can escalate it to TULAY.'),
  ('restocking_fee_max_bps', '0', 'OPEN ITEM: highest restocking fee a supplier may charge on change-of-mind returns (basis points; 0 = off).');

create type public.claim_type as enum ('damage', 'return', 'defect');
create type public.claim_status as enum
  ('open', 'awaiting_return', 'refund_pending', 'replacement_pending', 'rejected', 'escalated', 'declined', 'resolved', 'cancelled');
create type public.claim_remedy as enum ('refund', 'replacement');

-- Suppliers set their own restocking fee; the platform cap (restocking_fee_max_bps) always wins.
alter table public.suppliers add column restocking_fee_bps integer not null default 0 check (restocking_fee_bps between 0 and 10000);
grant select (restocking_fee_bps) on public.suppliers to anon;
grant update (restocking_fee_bps) on public.suppliers to authenticated;

-- ---------------------------------------------------------------- claims

create sequence public.claim_ref_seq;
create sequence public.ra_seq;

create table public.claims (
  id uuid primary key, -- chosen by the client so evidence can be uploaded first; doubles as the idempotency key
  ref text not null unique default 'CLM-' || lpad(nextval('public.claim_ref_seq')::text, 5, '0'),
  order_id uuid not null references public.orders (id),
  buyer_id uuid not null references public.profiles (id),
  supplier_id uuid not null references public.suppliers (id),
  type public.claim_type not null,
  item_ids uuid[] not null default '{}', -- order_items concerned; empty = the whole order
  description text not null check (char_length(description) between 10 and 2000),
  status public.claim_status not null default 'open',
  remedy public.claim_remedy,
  refund_centavos bigint not null default 0 check (refund_centavos >= 0),        -- agreed refund before the restocking fee
  restocking_fee_centavos bigint not null default 0 check (restocking_fee_centavos >= 0),
  online_refund_id uuid references public.refunds (id),
  manual_refund_centavos bigint not null default 0 check (manual_refund_centavos >= 0), -- COD cash the supplier pays back directly
  manual_refund_ref text not null default '' check (char_length(manual_refund_ref) <= 200),
  return_required boolean not null default false,
  return_payer text check (return_payer in ('buyer', 'supplier')),
  ra_number text unique,
  return_tracking_ref text not null default '' check (char_length(return_tracking_ref) <= 100),
  return_received_at timestamptz,
  response_note text not null default '' check (char_length(response_note) <= 1000),
  decision_note text not null default '' check (char_length(decision_note) <= 1000), -- TULAY support
  decided_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index claims_order_idx on public.claims (order_id);
create index claims_supplier_idx on public.claims (supplier_id, status);
create index claims_status_idx on public.claims (status, created_at);
create trigger claims_touch before update on public.claims
  for each row execute function private.touch_updated_at();

-- Photos / videos in the private order-files bucket at <order_id>/claims/<claim_id>/<file>.
create table public.claim_evidence (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.claims (id),
  storage_path text not null unique,
  file_name text not null check (char_length(file_name) between 1 and 200),
  uploaded_by uuid not null,
  created_at timestamptz not null default now()
);
create index claim_evidence_claim_idx on public.claim_evidence (claim_id);

create table public.claim_messages (
  id bigint generated always as identity primary key,
  claim_id uuid not null references public.claims (id),
  sender_id uuid not null,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index claim_messages_claim_idx on public.claim_messages (claim_id, id);

create table public.claim_status_history (
  id bigint generated always as identity primary key,
  claim_id uuid not null references public.claims (id),
  from_status public.claim_status,
  to_status public.claim_status not null,
  note text not null default '',
  actor_id uuid,
  created_at timestamptz not null default now()
);
create index claim_status_history_claim_idx on public.claim_status_history (claim_id, id);

create trigger claim_evidence_append_only before update or delete on public.claim_evidence
  for each row execute function private.forbid_change();
create trigger claim_messages_append_only before update or delete on public.claim_messages
  for each row execute function private.forbid_change();
create trigger claim_status_history_append_only before update or delete on public.claim_status_history
  for each row execute function private.forbid_change();

-- ---------------------------------------------------------------- reviews

-- One review per delivered order. Public unless hidden by TULAY support.
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders (id),
  buyer_id uuid not null references public.profiles (id),
  supplier_id uuid not null references public.suppliers (id),
  rating integer not null check (rating between 1 and 5),
  body text not null default '' check (char_length(body) <= 2000),
  supplier_reply text not null default '' check (char_length(supplier_reply) <= 1000),
  replied_at timestamptz,
  hidden boolean not null default false,
  hidden_reason text not null default '' check (char_length(hidden_reason) <= 500),
  created_at timestamptz not null default now()
);
create index reviews_supplier_idx on public.reviews (supplier_id, created_at desc);

-- ---------------------------------------------------------------- claim helpers

create function private.set_claim_status(p_claim_id uuid, p_to public.claim_status, p_note text default '') returns void
language plpgsql security definer set search_path = '' as $$
declare cur public.claim_status;
begin
  select status into cur from public.claims where id = p_claim_id;
  update public.claims set status = p_to,
    resolved_at = case when p_to in ('resolved', 'declined', 'cancelled') then now() else resolved_at end
  where id = p_claim_id;
  insert into public.claim_status_history (claim_id, from_status, to_status, note, actor_id)
  values (p_claim_id, cur, p_to, left(coalesce(p_note, ''), 1000), auth.uid());
end $$;

-- The caller's claim as buyer or as the order's (verified) supplier. Support uses its own functions.
create function private.my_claim(p_claim_id uuid, p_side text) returns public.claims
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_user();
  c public.claims;
begin
  select * into c from public.claims where id = p_claim_id for update;
  if c.id is null
     or (p_side = 'buyer' and c.buyer_id <> uid)
     or (p_side = 'supplier' and not exists (select 1 from public.suppliers s where s.id = c.supplier_id and s.owner_id = uid)) then
    raise exception 'Claim not found' using errcode = 'P0002';
  end if;
  return c;
end $$;

-- Most that can still be refunded on an order across all claims (online refunds + COD cash paid back).
create function private.claimable_left(p_order_id uuid) returns bigint
language sql stable security definer set search_path = '' as $$
  select o.total_centavos
    - coalesce((select sum(amount_centavos) from public.refunds where order_id = o.id and status <> 'failed'), 0)
    - coalesce((select sum(manual_refund_centavos) from public.claims where order_id = o.id and status in ('refund_pending', 'resolved')), 0)
  from public.orders o where o.id = p_order_id;
$$;

-- Applies an accepted outcome: refund (minus restocking fee on returns; online part through the gateway,
-- COD part paid by the supplier directly) or replacement. Called when no return is needed or the return arrived.
create function private.settle_claim(p_claim_id uuid) returns void
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
    perform private.notify(s.owner_id, 'Send the replacement', c.ref || ': please send the replacement to the buyer.', '/supplier/claims/' || c.id)
    from public.suppliers s where s.id = c.supplier_id;
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

  if net - online_part > 0 then
    perform private.set_claim_status(c.id, 'refund_pending', 'Supplier to pay back the cash-on-delivery part directly');
    perform private.notify(s.owner_id, 'Refund the buyer', c.ref || ': please send the buyer the cash-on-delivery part of the refund and record the reference.',
      '/supplier/claims/' || c.id)
    from public.suppliers s where s.id = c.supplier_id;
  else
    perform private.set_claim_status(c.id, 'resolved', 'Refund sent');
  end if;
  perform private.notify(c.buyer_id, 'Claim approved', c.ref || ': your refund is on its way.', '/buyer/claims/' || c.id);
  perform private.audit('claim.settle', 'claims', c.id::text,
    jsonb_build_object('net_centavos', net, 'online_centavos', online_part, 'refund_id', rid));
end $$;

-- Records an accepted outcome (supplier or support) and moves on: return first, or settle now.
create function private.accept_claim(
  p_claim public.claims, p_remedy public.claim_remedy, p_refund_centavos bigint, p_return_required boolean, p_note text
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  fee bigint := 0;
  bps integer;
  must_return boolean := p_return_required or p_claim.type = 'return';
begin
  if p_remedy is null then
    raise exception 'Choose refund or replacement' using errcode = '22023';
  end if;
  if p_remedy = 'refund' then
    if p_refund_centavos is null or p_refund_centavos <= 0 or p_refund_centavos > private.claimable_left(p_claim.order_id) then
      raise exception 'Refund must be between 1 and % centavos', private.claimable_left(p_claim.order_id) using errcode = '22023';
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

-- ---------------------------------------------------------------- buyer

-- Opens a claim inside its window with at least one photo or video already uploaded to
-- order-files/<order_id>/claims/<claim_id>/<file>. p_claim_id is chosen by the client (retry = same claim).
-- p_evidence: [{"path": "...", "fileName": "..."}]
create function public.open_claim(
  p_claim_id uuid, p_order_id uuid, p_type public.claim_type, p_item_ids uuid[], p_description text, p_evidence jsonb
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_user();
  o public.orders;
  window_days integer;
  ev jsonb;
  bad integer;
begin
  if p_claim_id is null then
    raise exception 'Claim id required' using errcode = '22023';
  end if;
  if exists (select 1 from public.claims where id = p_claim_id and buyer_id = uid) then
    return p_claim_id;
  end if;
  select * into o from public.orders where id = p_order_id and buyer_id = uid for update;
  if o.id is null then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;
  if o.status not in ('delivered', 'completed') or o.delivered_at is null then
    raise exception 'Problems can be reported once the order is delivered' using errcode = '22023';
  end if;
  window_days := private.setting_int(case p_type when 'damage' then 'report_window_damage_days'
    when 'return' then 'report_window_return_days' else 'report_window_defect_days' end);
  if o.delivered_at < now() - make_interval(days => window_days) then
    raise exception 'The % window (% days after delivery) has passed', p_type, window_days using errcode = '22023';
  end if;
  if exists (select 1 from public.claims where order_id = o.id and status not in ('resolved', 'declined', 'cancelled')) then
    raise exception 'This order already has an open claim' using errcode = '22023';
  end if;

  -- Items must belong to the order and fit the claim type.
  select count(*) into bad from unnest(coalesce(p_item_ids, '{}')) x
  where not exists (select 1 from public.order_items i where i.id = x and i.order_id = o.id);
  if bad > 0 then
    raise exception 'Unknown item on this order' using errcode = '22023';
  end if;
  if p_type = 'return' and exists (
    select 1 from public.order_items i where i.order_id = o.id and i.return_class <> 'standard'
      and (cardinality(coalesce(p_item_ids, '{}')) = 0 or i.id = any (p_item_ids))
  ) then
    raise exception 'Only standard items can be returned for a change of mind; custom and final-sale items cannot' using errcode = '22023';
  end if;
  if p_type = 'defect' and not exists (
    select 1 from public.order_items i where i.order_id = o.id and i.return_class = 'custom'
      and (cardinality(coalesce(p_item_ids, '{}')) = 0 or i.id = any (p_item_ids))
  ) then
    raise exception 'Print defects apply to custom-made items' using errcode = '22023';
  end if;

  if jsonb_typeof(coalesce(p_evidence, '[]')) <> 'array' or jsonb_array_length(coalesce(p_evidence, '[]')) = 0 then
    raise exception 'Add at least one photo or video' using errcode = '22023';
  end if;
  if jsonb_array_length(p_evidence) > 10 then
    raise exception 'Up to 10 files' using errcode = '22023';
  end if;
  for ev in select * from jsonb_array_elements(p_evidence) loop
    if (ev ->> 'path') !~ ('^' || o.id || '/claims/' || p_claim_id || '/[A-Za-z0-9._-]{1,200}$') then
      raise exception 'Invalid evidence file path' using errcode = '22023';
    end if;
  end loop;

  insert into public.claims (id, order_id, buyer_id, supplier_id, type, item_ids, description)
  values (p_claim_id, o.id, uid, o.supplier_id, p_type, coalesce(p_item_ids, '{}'), btrim(coalesce(p_description, '')));
  insert into public.claim_evidence (claim_id, storage_path, file_name, uploaded_by)
  select p_claim_id, e ->> 'path', left(coalesce(e ->> 'fileName', 'file'), 200), uid from jsonb_array_elements(p_evidence) e;
  insert into public.claim_status_history (claim_id, from_status, to_status, actor_id) values (p_claim_id, null, 'open', uid);
  perform private.notify(s.owner_id, 'New claim', o.ref || ': the buyer reported a problem. Please answer within '
      || coalesce(private.setting_int('claim_response_days'), 3) || ' days.', '/supplier/claims/' || p_claim_id)
  from public.suppliers s where s.id = o.supplier_id;
  perform private.audit('claim.open', 'claims', p_claim_id::text, jsonb_build_object('order_id', o.id, 'type', p_type));
  return p_claim_id;
end $$;

-- Buyer: after a rejection, or when the supplier has not answered within claim_response_days.
create function public.escalate_claim(p_claim_id uuid, p_note text default '') returns void
language plpgsql security definer set search_path = '' as $$
declare c public.claims := private.my_claim(p_claim_id, 'buyer');
begin
  if not (c.status = 'rejected'
          or (c.status = 'open' and c.created_at < now() - make_interval(days => coalesce(private.setting_int('claim_response_days'), 3)))) then
    raise exception 'You can ask TULAY to step in after the supplier rejects or does not answer in time' using errcode = '22023';
  end if;
  perform private.set_claim_status(c.id, 'escalated', btrim(coalesce(p_note, '')));
  perform private.notify_support('Claim escalated', c.ref || ' needs a decision.', '/admin/claims/' || c.id);
end $$;

create function public.cancel_claim(p_claim_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.claims := private.my_claim(p_claim_id, 'buyer');
begin
  if c.status not in ('open', 'rejected') then
    raise exception 'This claim can no longer be withdrawn' using errcode = '22023';
  end if;
  perform private.set_claim_status(c.id, 'cancelled', 'Withdrawn by the buyer');
end $$;

-- Whoever pays for the return records its tracking reference (or courier booking).
create function public.record_return_shipment(p_claim_id uuid, p_tracking_ref text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_user();
  c public.claims;
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
  update public.claims set return_tracking_ref = left(btrim(coalesce(p_tracking_ref, '')), 100) where id = c.id;
end $$;

-- ---------------------------------------------------------------- supplier

-- Accept (refund amount or replacement; return optional except for change-of-mind returns) or reject with a reason.
create function public.respond_claim(
  p_claim_id uuid, p_accept boolean, p_remedy public.claim_remedy, p_refund_centavos bigint, p_return_required boolean, p_note text
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  c public.claims := private.my_claim(p_claim_id, 'supplier');
  note text := btrim(coalesce(p_note, ''));
begin
  if c.status <> 'open' then
    raise exception 'This claim was already answered' using errcode = '22023';
  end if;
  update public.claims set response_note = left(note, 1000) where id = c.id;
  if not p_accept then
    if char_length(note) < 3 then
      raise exception 'Give the buyer a reason' using errcode = '22023';
    end if;
    perform private.set_claim_status(c.id, 'rejected', note);
    perform private.notify(c.buyer_id, 'Claim rejected', c.ref || ': ' || left(note, 200) || ' You can ask TULAY to review it.',
      '/buyer/claims/' || c.id);
  else
    perform private.accept_claim(c, p_remedy, p_refund_centavos, coalesce(p_return_required, false), note);
  end if;
  perform private.audit('claim.respond', 'claims', c.id::text, jsonb_build_object('accept', p_accept, 'remedy', p_remedy));
end $$;

-- Supplier: the returned item arrived -> settle (refund or replacement).
create function public.confirm_return_received(p_claim_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.claims := private.my_claim(p_claim_id, 'supplier');
begin
  if c.status <> 'awaiting_return' then
    raise exception 'No return is expected on this claim' using errcode = '22023';
  end if;
  update public.claims set return_received_at = now() where id = c.id;
  perform private.settle_claim(c.id);
end $$;

-- Supplier: the cash-on-delivery part was paid back directly (GCash / bank reference).
create function public.record_manual_refund(p_claim_id uuid, p_reference text) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.claims := private.my_claim(p_claim_id, 'supplier');
begin
  if c.status <> 'refund_pending' then
    raise exception 'No direct refund is due on this claim' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_reference, ''))) < 3 then
    raise exception 'Enter the transfer reference' using errcode = '22023';
  end if;
  update public.claims set manual_refund_ref = left(btrim(p_reference), 200) where id = c.id;
  perform private.set_claim_status(c.id, 'resolved', 'Paid back directly: ' || left(btrim(p_reference), 200));
  perform private.notify(c.buyer_id, 'Refund sent', c.ref || ': the supplier sent your refund (ref ' || left(btrim(p_reference), 60) || ').',
    '/buyer/claims/' || c.id);
end $$;

create function public.mark_replacement_sent(p_claim_id uuid, p_note text default '') returns void
language plpgsql security definer set search_path = '' as $$
declare c public.claims := private.my_claim(p_claim_id, 'supplier');
begin
  if c.status <> 'replacement_pending' then
    raise exception 'No replacement is due on this claim' using errcode = '22023';
  end if;
  perform private.set_claim_status(c.id, 'resolved', 'Replacement sent ' || btrim(coalesce(p_note, '')));
  perform private.notify(c.buyer_id, 'Replacement sent', c.ref || ': your replacement is on its way.', '/buyer/claims/' || c.id);
end $$;

-- ---------------------------------------------------------------- both sides + support

create function public.add_claim_message(p_claim_id uuid, p_body text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_user();
  c public.claims;
  body text := btrim(coalesce(p_body, ''));
begin
  select * into c from public.claims where id = p_claim_id;
  if c.id is null or not (c.buyer_id = uid or public.has_admin_role('support')
       or exists (select 1 from public.suppliers s where s.id = c.supplier_id and s.owner_id = uid)) then
    raise exception 'Claim not found' using errcode = 'P0002';
  end if;
  if body = '' or char_length(body) > 2000 then
    raise exception 'Messages are 1 to 2000 characters' using errcode = '22023';
  end if;
  insert into public.claim_messages (claim_id, sender_id, body) values (c.id, uid, body);
end $$;

-- Support decides an escalated claim: refund / replacement (as an acceptance) or decline (final).
create function public.admin_decide_claim(
  p_claim_id uuid, p_outcome text, p_refund_centavos bigint, p_return_required boolean, p_note text
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  c public.claims;
  note text := btrim(coalesce(p_note, ''));
begin
  if not public.has_admin_role('support') then
    raise exception 'Support role with MFA required' using errcode = '42501';
  end if;
  select * into c from public.claims where id = p_claim_id for update;
  if c.id is null then
    raise exception 'Claim not found' using errcode = 'P0002';
  end if;
  if c.status <> 'escalated' then
    raise exception 'Only escalated claims are decided by TULAY' using errcode = '22023';
  end if;
  if char_length(note) < 3 then
    raise exception 'Explain the decision' using errcode = '22023';
  end if;
  update public.claims set decision_note = left(note, 1000), decided_by = auth.uid() where id = c.id;
  if p_outcome = 'decline' then
    perform private.set_claim_status(c.id, 'declined', note);
    perform private.notify(c.buyer_id, 'Claim decided', c.ref || ': ' || left(note, 200), '/buyer/claims/' || c.id);
  elsif p_outcome in ('refund', 'replacement') then
    perform private.accept_claim(c, p_outcome::public.claim_remedy, p_refund_centavos, coalesce(p_return_required, false), note);
  else
    raise exception 'Unknown outcome' using errcode = '22023';
  end if;
  perform private.notify(s.owner_id, 'TULAY decided a claim', c.ref || ': ' || left(note, 200), '/supplier/claims/' || c.id)
  from public.suppliers s where s.id = c.supplier_id;
  perform private.audit('claim.decide', 'claims', c.id::text, jsonb_build_object('outcome', p_outcome, 'note', note));
end $$;

-- ---------------------------------------------------------------- reviews

create function public.post_review(p_order_id uuid, p_rating integer, p_body text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_user();
  o public.orders;
  rid uuid;
begin
  select * into o from public.orders where id = p_order_id and buyer_id = uid;
  if o.id is null then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;
  if o.status not in ('delivered', 'completed') then
    raise exception 'You can review an order once it is delivered' using errcode = '22023';
  end if;
  insert into public.reviews (order_id, buyer_id, supplier_id, rating, body)
  values (o.id, uid, o.supplier_id, p_rating, btrim(coalesce(p_body, '')))
  on conflict (order_id) do nothing
  returning id into rid;
  if rid is null then
    raise exception 'You already reviewed this order' using errcode = '22023';
  end if;
  perform private.notify(s.owner_id, 'New review', o.ref || ': a buyer left a ' || p_rating || '-star review.', '/supplier/reviews')
  from public.suppliers s where s.id = o.supplier_id;
  return rid;
end $$;

create function public.reply_review(p_review_id uuid, p_reply text) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.require_user();
begin
  update public.reviews r set supplier_reply = btrim(coalesce(p_reply, '')), replied_at = now()
  from public.suppliers s
  where r.id = p_review_id and s.id = r.supplier_id and s.owner_id = uid and r.replied_at is null
    and char_length(btrim(coalesce(p_reply, ''))) between 1 and 1000;
  if not found then
    raise exception 'You can reply once, 1 to 1000 characters' using errcode = '22023';
  end if;
end $$;

create function public.admin_hide_review(p_review_id uuid, p_hidden boolean, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_admin_role('support') then
    raise exception 'Support role with MFA required' using errcode = '42501';
  end if;
  if p_hidden and char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'A reason is required' using errcode = '22023';
  end if;
  update public.reviews set hidden = p_hidden, hidden_reason = case when p_hidden then btrim(p_reason) else '' end where id = p_review_id;
  if not found then
    raise exception 'Review not found' using errcode = 'P0002';
  end if;
  perform private.audit(case when p_hidden then 'review.hide' else 'review.unhide' end, 'reviews', p_review_id::text,
    jsonb_build_object('reason', p_reason));
end $$;

-- Public rating per supplier over visible reviews (security invoker: RLS on reviews applies).
create view public.supplier_ratings with (security_invoker = true) as
select supplier_id, count(*)::integer as review_count, round(avg(rating)::numeric, 1) as average_rating
from public.reviews where not hidden
group by supplier_id;

-- ---------------------------------------------------------------- completion job

-- Delivered orders become completed once every report window has passed and no claim is still open.
create function private.complete_orders() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  o uuid;
  n integer := 0;
  longest integer := greatest(
    coalesce(private.setting_int('report_window_damage_days'), 5),
    coalesce(private.setting_int('report_window_return_days'), 30),
    coalesce(private.setting_int('report_window_defect_days'), 60));
begin
  for o in select x.id from public.orders x
    where x.status = 'delivered' and x.delivered_at < now() - make_interval(days => longest)
      and not exists (select 1 from public.claims c where c.order_id = x.id and c.status not in ('resolved', 'declined', 'cancelled'))
  loop
    perform private.set_order_status(o, 'completed', 'Report windows closed');
    n := n + 1;
  end loop;
  return n;
end $$;

select cron.schedule('tulay-complete-orders', '30 2 * * *', 'select private.complete_orders()');

-- ---------------------------------------------------------------- storage: claim evidence

-- Claim evidence may be video: allow MP4 / QuickTime in order-files and raise the per-file limit to 50 MB.
update storage.buckets
set allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime'],
    file_size_limit = 52428800
where id = 'order-files';

create policy "order-files: buyer uploads claim evidence" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'order-files' and (storage.foldername(name))[2] = 'claims' and (select public.is_active_user())
    and exists (select 1 from public.orders o where o.id::text = (storage.foldername(name))[1] and o.buyer_id = (select auth.uid()))
  );

-- ---------------------------------------------------------------- privileges + RLS

revoke all on public.claims, public.claim_evidence, public.claim_messages, public.claim_status_history, public.reviews, public.supplier_ratings
  from anon, authenticated;
grant select on public.claims, public.claim_evidence, public.claim_messages, public.claim_status_history to authenticated;
grant select on public.reviews, public.supplier_ratings to anon, authenticated;

alter table public.claims enable row level security;
alter table public.claim_evidence enable row level security;
alter table public.claim_messages enable row level security;
alter table public.claim_status_history enable row level security;
alter table public.reviews enable row level security;

create policy "claims: buyer, supplier or support" on public.claims for select to authenticated
  using (
    buyer_id = (select auth.uid())
    or supplier_id = (select public.my_supplier_id())
    or (select public.has_admin_role('support', 'finance'))
  );
create policy "claim_evidence: with visible claim" on public.claim_evidence for select to authenticated
  using (exists (select 1 from public.claims c where c.id = claim_id));
create policy "claim_messages: with visible claim" on public.claim_messages for select to authenticated
  using (exists (select 1 from public.claims c where c.id = claim_id));
create policy "claim_status_history: with visible claim" on public.claim_status_history for select to authenticated
  using (exists (select 1 from public.claims c where c.id = claim_id));

create policy "reviews: visible are public" on public.reviews for select to anon, authenticated using (not hidden);
create policy "reviews: parties and support see hidden ones" on public.reviews for select to authenticated
  using (buyer_id = (select auth.uid()) or supplier_id = (select public.my_supplier_id()) or (select public.has_admin_role('support')));

revoke execute on all functions in schema private from public, anon, authenticated;
revoke execute on function
  public.open_claim(uuid, uuid, public.claim_type, uuid[], text, jsonb),
  public.escalate_claim(uuid, text),
  public.cancel_claim(uuid),
  public.record_return_shipment(uuid, text),
  public.respond_claim(uuid, boolean, public.claim_remedy, bigint, boolean, text),
  public.confirm_return_received(uuid),
  public.record_manual_refund(uuid, text),
  public.mark_replacement_sent(uuid, text),
  public.add_claim_message(uuid, text),
  public.admin_decide_claim(uuid, text, bigint, boolean, text),
  public.post_review(uuid, integer, text),
  public.reply_review(uuid, text),
  public.admin_hide_review(uuid, boolean, text)
  from public, anon;
grant execute on function
  public.open_claim(uuid, uuid, public.claim_type, uuid[], text, jsonb),
  public.escalate_claim(uuid, text),
  public.cancel_claim(uuid),
  public.record_return_shipment(uuid, text),
  public.respond_claim(uuid, boolean, public.claim_remedy, bigint, boolean, text),
  public.confirm_return_received(uuid),
  public.record_manual_refund(uuid, text),
  public.mark_replacement_sent(uuid, text),
  public.add_claim_message(uuid, text),
  public.admin_decide_claim(uuid, text, bigint, boolean, text),
  public.post_review(uuid, integer, text),
  public.reply_review(uuid, text),
  public.admin_hide_review(uuid, boolean, text)
  to authenticated;
