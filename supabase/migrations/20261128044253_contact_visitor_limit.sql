-- Contact form limits per visitor (security audit, finding 5). Before: one site-wide hourly cap, so a single
-- script could use it up and block every other sender, privacy requests included. Now each visitor (the account
-- when signed in, the IP address otherwise) has their own cap, and the site-wide cap only applies to signed-out
-- senders. The visitor id is a SHA-256 hash worked out by the Server Action, so the function is service-role only.

insert into public.platform_settings (key, value, description) values
  ('contact_messages_per_visitor_per_hour', '5', 'Contact form messages one visitor can send per hour (per account when signed in, per IP address otherwise).')
on conflict (key) do nothing;

update public.platform_settings
set description = 'Contact form messages accepted per hour from visitors who are not signed in, across the whole site, so a script cannot flood support.'
where key = 'contact_messages_per_hour';

-- Hash of the sender (lib/visitor.ts): used for the per-visitor limit only. Null on messages sent before this change.
alter table public.contact_messages add column client text check (client ~ '^[0-9a-f]{64}$');
create index contact_messages_client_idx on public.contact_messages (client, created_at desc);

drop function public.submit_contact_message(text, text, text, text, text);

create function public.submit_contact_message(
  p_topic text, p_name text, p_email text, p_reference text, p_message text, p_client text, p_user_id uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  new_id uuid;
  v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if coalesce(p_client, '') !~ '^[0-9a-f]{64}$' then
    raise exception 'Bad client id' using errcode = '22023';
  end if;
  -- Serialise the check-then-insert so concurrent posts cannot overshoot the limits.
  perform pg_advisory_xact_lock(hashtext('submit_contact_message'));
  if (select count(*) from public.contact_messages where client = p_client and created_at > now() - interval '1 hour')
     >= coalesce(private.setting_int('contact_messages_per_visitor_per_hour'), 5) then
    raise exception 'Too many messages. Please try again later.' using errcode = '22023';
  end if;
  -- Site-wide and per-email backstops for signed-out senders only: a flood must never block people with an account.
  if p_user_id is null then
    if (select count(*) from public.contact_messages where user_id is null and created_at > now() - interval '1 hour')
       >= coalesce(private.setting_int('contact_messages_per_hour'), 30) then
      raise exception 'The contact form is busy. Sign in and try again, or try again later.' using errcode = '22023';
    end if;
    if (select count(*) from public.contact_messages where email = v_email and created_at > now() - interval '1 hour') >= 5 then
      raise exception 'Too many messages from this email. Please try again later.' using errcode = '22023';
    end if;
  end if;
  insert into public.contact_messages (topic, name, email, reference, message, user_id, client)
  values (btrim(p_topic), btrim(p_name), v_email, btrim(coalesce(p_reference, '')), btrim(p_message), p_user_id, p_client)
  returning id into new_id;
  perform private.notify_support(
    case when p_topic like 'privacy%' then 'Privacy request' else 'New contact message' end,
    btrim(p_name) || ': ' || left(btrim(p_message), 200), '/admin/messages');
  return new_id;
end $$;

revoke execute on function public.submit_contact_message(text, text, text, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.submit_contact_message(text, text, text, text, text, text, uuid) to service_role;

revoke execute on all functions in schema private from public, anon, authenticated;
