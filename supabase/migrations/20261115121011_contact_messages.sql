-- Contact form messages (audit D-1): stored for TULAY support instead of being dropped. Privacy requests
-- (Data Privacy Act rights) arrive here too, so they must never be lost.

create table public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  topic text not null check (topic ~ '^[a-z_]{1,40}$'),
  name text not null check (char_length(name) between 1 and 100),
  email text not null check (char_length(email) between 3 and 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  reference text not null default '' check (char_length(reference) <= 60),
  message text not null check (char_length(message) between 1 and 2000),
  user_id uuid references public.profiles (id),
  handled_at timestamptz,
  handled_by uuid,
  created_at timestamptz not null default now()
);
create index contact_messages_open_idx on public.contact_messages (handled_at, created_at desc);

-- Anyone (signed in or not) may write; at most 5 messages per email per hour.
create function public.submit_contact_message(p_topic text, p_name text, p_email text, p_reference text, p_message text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  new_id uuid;
  v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if (select count(*) from public.contact_messages where email = v_email and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'Too many messages from this email. Please try again later.' using errcode = '22023';
  end if;
  insert into public.contact_messages (topic, name, email, reference, message, user_id)
  values (btrim(p_topic), btrim(p_name), v_email, btrim(coalesce(p_reference, '')), btrim(p_message), auth.uid())
  returning id into new_id;
  perform private.notify_support(
    case when p_topic like 'privacy%' then 'Privacy request' else 'New contact message' end,
    btrim(p_name) || ': ' || left(btrim(p_message), 200), '/admin/messages');
  return new_id;
end $$;

-- Support marks a message handled.
create function public.admin_handle_contact_message(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_admin_role('support') then
    raise exception 'Support role with MFA required' using errcode = '42501';
  end if;
  update public.contact_messages set handled_at = now(), handled_by = auth.uid() where id = p_id and handled_at is null;
  if not found then
    raise exception 'Message not found or already handled' using errcode = 'P0002';
  end if;
  perform private.audit('contact.handled', 'contact_messages', p_id::text);
end $$;

revoke all on public.contact_messages from anon, authenticated;
grant select on public.contact_messages to authenticated;
alter table public.contact_messages enable row level security;
create policy "contact_messages: support" on public.contact_messages for select to authenticated
  using ((select public.has_admin_role('support')));

revoke execute on function public.submit_contact_message(text, text, text, text, text), public.admin_handle_contact_message(uuid)
  from public;
grant execute on function public.submit_contact_message(text, text, text, text, text) to anon, authenticated;
grant execute on function public.admin_handle_contact_message(uuid) to authenticated;
