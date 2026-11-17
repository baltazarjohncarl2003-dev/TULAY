-- TULAY AI: a daily limit per visitor (signed-in account, or IP when signed out), so one visitor cannot use up the site-wide day.

insert into public.platform_settings (key, value, description) values
  ('ai_requests_per_visitor_per_day', '10', 'TULAY AI searches one visitor can run per day (per account when signed in, per IP otherwise). Over the limit, search uses the basic matcher.');

-- Same as before plus the per-visitor daily check. Server-only (service role).
create or replace function public.take_ai_call(p_client text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  per_minute integer := coalesce((select (value #>> '{}')::integer from public.platform_settings where key = 'ai_requests_per_minute'), 0);
  per_day integer := coalesce((select (value #>> '{}')::integer from public.platform_settings where key = 'ai_requests_per_day'), 0);
  per_visitor_day integer := coalesce((select (value #>> '{}')::integer from public.platform_settings where key = 'ai_requests_per_visitor_per_day'), 0);
begin
  if coalesce(p_client, '') !~ '^[0-9a-f]{64}$' then
    raise exception 'Bad client id' using errcode = '22023';
  end if;
  -- Serialise the check-then-insert so concurrent calls cannot overshoot the limits.
  perform pg_advisory_xact_lock(hashtext('take_ai_call'));
  delete from private.ai_calls where at < now() - interval '1 day';
  if (select count(*) from private.ai_calls) >= per_day
     or (select count(*) from private.ai_calls where client = p_client) >= per_visitor_day
     or (select count(*) from private.ai_calls where client = p_client and at > now() - interval '1 minute') >= per_minute then
    return false;
  end if;
  insert into private.ai_calls (client) values (p_client);
  return true;
end $$;

revoke execute on function public.take_ai_call(text) from public, anon, authenticated;
grant execute on function public.take_ai_call(text) to service_role;
