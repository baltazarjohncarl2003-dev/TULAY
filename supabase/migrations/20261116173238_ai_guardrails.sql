-- Guardrails: banned items (enforced on listings and RFQs, filtered out of TULAY AI) and a rate limit on Gemini calls.

-- ---------------------------------------------------------------- banned terms

-- Lowercase words or phrases. A term matches as whole words, plus a plural "s"/"es".
create table public.banned_terms (
  term text primary key check (term ~ '^[a-z0-9]+( [a-z0-9]+)*$' and char_length(term) between 2 and 60),
  created_at timestamptz not null default now()
);

-- Starting list for the owner to review (admin-editable). Avoid short words that sit inside normal products
-- ("gun" would block "glue gun").
insert into public.banned_terms (term) values
  ('firearm'), ('ammunition'), ('explosive'), ('grenade'),
  ('shabu'), ('methamphetamine'), ('marijuana'), ('cocaine'),
  ('counterfeit'), ('fake id'), ('fake receipt'), ('ivory'), ('pangolin');

revoke all on public.banned_terms from anon, authenticated;
grant select on public.banned_terms to anon, authenticated;
alter table public.banned_terms enable row level security;
create policy "banned_terms: public" on public.banned_terms for select to anon, authenticated using (true);

-- The first banned term found in the text, or null.
create function private.banned_term_in(p_text text) returns text
language sql stable security definer set search_path = '' as $$
  select term from public.banned_terms
  where lower(coalesce(p_text, '')) ~ ('\m' || replace(term, ' ', '\s+') || '(s|es)?\M')
  order by term
  limit 1
$$;

-- For TULAY AI: the banned term in each text (null when clean), in the same order.
create function public.banned_terms_in(p_texts text[]) returns text[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(private.banned_term_in(t) order by n), '{}') from unnest(p_texts) with ordinality as u (t, n)
$$;

create function private.reject_banned_text() returns trigger
language plpgsql security definer set search_path = '' as $$
declare hit text;
begin
  -- Separate branches: plpgsql resolves every field in one expression, and each table has different columns.
  if tg_table_name = 'products' then
    hit := private.banned_term_in(new.title || ' ' || new.description);
  else
    hit := private.banned_term_in(new.product || ' ' || new.description || ' ' || new.specs);
  end if;
  if hit is not null then
    raise exception '"%" is not allowed on TULAY. Remove it and try again.', hit using errcode = '23514';
  end if;
  return new;
end $$;

create trigger products_reject_banned before insert or update of title, description on public.products
  for each row execute function private.reject_banned_text();
create trigger rfqs_reject_banned before insert or update of product, description, specs on public.rfqs
  for each row execute function private.reject_banned_text();

create function public.admin_add_banned_term(p_term text) returns void
language plpgsql security definer set search_path = '' as $$
declare t text := regexp_replace(lower(btrim(coalesce(p_term, ''))), '\s+', ' ', 'g');
begin
  if not public.has_admin_role('verifier') then
    raise exception 'Verifier role with MFA required' using errcode = '42501';
  end if;
  if t !~ '^[a-z0-9]+( [a-z0-9]+)*$' or char_length(t) not between 2 and 60 then
    raise exception 'Use 2 to 60 letters, numbers and spaces' using errcode = '22023';
  end if;
  insert into public.banned_terms (term) values (t) on conflict do nothing;
  perform private.audit('banned_term.add', 'banned_terms', t);
end $$;

create function public.admin_remove_banned_term(p_term text) returns void
language plpgsql security definer set search_path = '' as $$
declare t text := regexp_replace(lower(btrim(coalesce(p_term, ''))), '\s+', ' ', 'g');
begin
  if not public.has_admin_role('verifier') then
    raise exception 'Verifier role with MFA required' using errcode = '42501';
  end if;
  delete from public.banned_terms where term = t;
  perform private.audit('banned_term.remove', 'banned_terms', t);
end $$;

revoke execute on function private.banned_term_in(text), private.reject_banned_text() from public, anon, authenticated;
revoke execute on function public.banned_terms_in(text[]) from public;
grant execute on function public.banned_terms_in(text[]) to anon, authenticated;

-- ---------------------------------------------------------------- TULAY AI rate limit

insert into public.platform_settings (key, value, description) values
  ('ai_requests_per_minute', '10', 'TULAY AI searches one visitor (IP address) can run per minute. Over the limit, search uses the basic matcher.'),
  ('ai_requests_per_day', '1000', 'TULAY AI searches the whole site can run per day (caps the Gemini bill). 0 turns TULAY AI off.');

-- One row per Gemini call; client is a SHA-256 of the IP so no raw address is stored. Kept for one day.
create table private.ai_calls (
  id bigint generated always as identity primary key,
  client text not null check (client ~ '^[0-9a-f]{64}$'),
  at timestamptz not null default now()
);
create index ai_calls_client_at on private.ai_calls (client, at);
create index ai_calls_at on private.ai_calls (at);
alter table private.ai_calls enable row level security;

-- True and records the call when this client is under both limits. Server-only (service role).
create function public.take_ai_call(p_client text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  per_minute integer := coalesce((select (value #>> '{}')::integer from public.platform_settings where key = 'ai_requests_per_minute'), 0);
  per_day integer := coalesce((select (value #>> '{}')::integer from public.platform_settings where key = 'ai_requests_per_day'), 0);
begin
  if coalesce(p_client, '') !~ '^[0-9a-f]{64}$' then
    raise exception 'Bad client id' using errcode = '22023';
  end if;
  -- Serialise the check-then-insert so concurrent calls cannot overshoot the limits.
  perform pg_advisory_xact_lock(hashtext('take_ai_call'));
  delete from private.ai_calls where at < now() - interval '1 day';
  if (select count(*) from private.ai_calls) >= per_day
     or (select count(*) from private.ai_calls where client = p_client and at > now() - interval '1 minute') >= per_minute then
    return false;
  end if;
  insert into private.ai_calls (client) values (p_client);
  return true;
end $$;

revoke execute on function public.take_ai_call(text) from public, anon, authenticated;
grant execute on function public.take_ai_call(text) to service_role;
