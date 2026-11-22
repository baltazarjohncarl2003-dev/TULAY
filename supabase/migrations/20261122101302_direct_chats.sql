-- Direct buyer-to-supplier chats (no RFQ needed) and per-user read tracking for every chat.
-- Owner's decisions, 2026-11-22: buyers can message a supplier from its card, the supplier sees the
-- buyer's business name in a direct chat (RFQ threads stay anonymous), unread chats show a red dot.

create table public.direct_conversations (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references public.profiles (id),
  supplier_id uuid not null references public.suppliers (id),
  -- Copied so suppliers never need read access to the buyer's profile; refreshed on each buyer message.
  buyer_name text not null check (char_length(buyer_name) between 1 and 150),
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (buyer_id, supplier_id)
);
create index direct_conversations_supplier_idx on public.direct_conversations (supplier_id, last_message_at desc);

create table public.direct_messages (
  id bigint generated always as identity primary key,
  conversation_id uuid not null references public.direct_conversations (id),
  sender_id uuid not null,
  body text not null check (char_length(body) between 1 and 2000),
  idempotency_key uuid not null,
  created_at timestamptz not null default now(),
  unique (sender_id, idempotency_key)
);
create index direct_messages_thread_idx on public.direct_messages (conversation_id, created_at);
create trigger direct_messages_append_only before update or delete on public.direct_messages
  for each row execute function private.forbid_change();

-- thread_id is a direct conversation id, or `<rfq id>:<supplier id>` for an RFQ thread.
create table public.chat_reads (
  user_id uuid not null references public.profiles (id) on delete cascade,
  thread_id text not null check (char_length(thread_id) <= 73),
  last_read_at timestamptz not null,
  primary key (user_id, thread_id)
);

-- Buyer starts or continues with p_supplier_id or p_conversation_id; the supplier replies with p_conversation_id.
-- A retry with the same key returns the conversation without a second message or notification.
create function public.send_direct_message(
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
  s public.suppliers;
  p public.profiles;
  existing uuid;
  new_id bigint;
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

  if p_conversation_id is not null then
    select * into c from public.direct_conversations where id = p_conversation_id;
    select * into s from public.suppliers where id = c.supplier_id;
    if c.id is null or uid not in (c.buyer_id, s.owner_id) then
      raise exception 'Conversation not found' using errcode = 'P0002';
    end if;
  else
    select * into s from public.suppliers where id = p_supplier_id;
  end if;

  if c.id is null or uid = c.buyer_id then
    if s.id is null or s.status <> 'verified' then
      raise exception 'This supplier is not available for messages' using errcode = '22023';
    end if;
    if s.owner_id = uid then
      raise exception 'You cannot message your own business' using errcode = '22023';
    end if;
    select * into p from public.profiles where id = uid;
    if p.role = 'admin' then
      raise exception 'Admin accounts cannot start supplier chats' using errcode = '42501';
    end if;
    insert into public.direct_conversations (buyer_id, supplier_id, buyer_name)
    values (uid, s.id, coalesce(nullif(btrim(p.business_name), ''), nullif(btrim(p.full_name), ''), 'Buyer'))
    on conflict (buyer_id, supplier_id) do update set buyer_name = excluded.buyer_name
    returning * into c;
  end if;

  -- shortcut: no per-user message rate limit yet; add one (admin setting) before opening sign-ups widely.
  insert into public.direct_messages (conversation_id, sender_id, body, idempotency_key)
  values (c.id, uid, clean, p_idempotency_key)
  on conflict (sender_id, idempotency_key) do nothing
  returning id into new_id;
  if new_id is null then
    return c.id;
  end if;

  update public.direct_conversations set last_message_at = greatest(last_message_at, now()) where id = c.id;
  if uid = c.buyer_id then
    perform private.notify(s.owner_id, 'New message', c.buyer_name || ': ' || left(clean, 120), '/supplier/messages');
  else
    perform private.notify(c.buyer_id, 'New message', s.business_name || ': ' || left(clean, 120), '/buyer/messages');
  end if;
  return c.id;
end $$;

-- Marks a chat read up to its newest message, so a message arriving afterwards still counts as unread.
create function public.mark_chat_read(p_thread_id text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_user();
  id_re constant text := '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
  rfq uuid;
  sup uuid;
  conv uuid;
  latest timestamptz;
begin
  if coalesce(p_thread_id, '') ~ ('^' || id_re || ':' || id_re || '$') then
    rfq := split_part(p_thread_id, ':', 1)::uuid;
    sup := split_part(p_thread_id, ':', 2)::uuid;
    if not exists (
      select 1 from public.rfq_invites i
      join public.rfqs r on r.id = i.rfq_id
      join public.suppliers s on s.id = i.supplier_id
      where i.rfq_id = rfq and i.supplier_id = sup and uid in (r.buyer_id, s.owner_id)
    ) then
      raise exception 'Conversation not found' using errcode = 'P0002';
    end if;
    select max(created_at) into latest from public.rfq_messages where rfq_id = rfq and supplier_id = sup;
  elsif coalesce(p_thread_id, '') ~ ('^' || id_re || '$') then
    conv := p_thread_id::uuid;
    if not exists (
      select 1 from public.direct_conversations c
      join public.suppliers s on s.id = c.supplier_id
      where c.id = conv and uid in (c.buyer_id, s.owner_id)
    ) then
      raise exception 'Conversation not found' using errcode = 'P0002';
    end if;
    select max(created_at) into latest from public.direct_messages where conversation_id = conv;
  else
    raise exception 'Conversation not found' using errcode = 'P0002';
  end if;

  if latest is null then
    return;
  end if;
  insert into public.chat_reads (user_id, thread_id, last_read_at) values (uid, p_thread_id, latest)
  on conflict (user_id, thread_id) do update
    set last_read_at = greatest(public.chat_reads.last_read_at, excluded.last_read_at);
end $$;

-- ---------------------------------------------------------------- privileges + RLS

revoke all on public.direct_conversations, public.direct_messages, public.chat_reads from anon, authenticated;
grant select on public.direct_conversations, public.direct_messages, public.chat_reads to authenticated;

alter table public.direct_conversations enable row level security;
alter table public.direct_messages enable row level security;
alter table public.chat_reads enable row level security;

create policy "direct_conversations: parties or support" on public.direct_conversations for select to authenticated
  using (
    buyer_id = (select auth.uid())
    or supplier_id = (select public.my_supplier_id())
    or (select public.has_admin_role('support'))
  );
-- The subquery runs under the policy above, so messages follow conversation visibility.
create policy "direct_messages: with visible conversation" on public.direct_messages for select to authenticated
  using (conversation_id in (select id from public.direct_conversations));
create policy "chat_reads: own" on public.chat_reads for select to authenticated
  using (user_id = (select auth.uid()));

revoke execute on function
  public.send_direct_message(uuid, uuid, text, uuid),
  public.mark_chat_read(text)
  from public, anon;
grant execute on function
  public.send_direct_message(uuid, uuid, text, uuid),
  public.mark_chat_read(text)
  to authenticated;
