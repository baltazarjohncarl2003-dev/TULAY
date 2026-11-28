-- Load data for scripts/perf/measure.mjs. LOCAL DATABASE ONLY: run it through the local container,
--   docker exec -i supabase_db_TULAY psql -U postgres -v ON_ERROR_STOP=1 < scripts/perf/load.sql
-- Adds 56 copies of every approved listing (33 seed listings -> 1,881) and one buyer chat of 1,201 messages.
-- `supabase db reset` removes it all again.

do $$
begin
  -- The seed accounts exist only in a local database; refuse anywhere else.
  if not exists (select 1 from public.profiles where email = 'buyer@tulay.test') then
    raise exception 'Seed accounts not found: this script is for the local database only';
  end if;
  if (select count(*) from public.products) > 100 then
    raise notice 'Load data already present; nothing to do';
    return;
  end if;

  -- Copies sort after the originals (older created_at), so the newest listings stay the seed ones.
  insert into public.products (
    supplier_id, category_id, title, description, moq, unit, indicative_price_centavos, lead_days, return_class,
    listing_type, status, review_note, idempotency_key, submitted_at, reviewed_at, created_at, updated_at, stock
  )
  select p.supplier_id, p.category_id, p.title, p.description, p.moq, p.unit, p.indicative_price_centavos, p.lead_days,
    p.return_class, p.listing_type, p.status, p.review_note, gen_random_uuid(), p.submitted_at, p.reviewed_at,
    p.created_at - make_interval(days => n), p.updated_at, p.stock
  from public.products p
  cross join generate_series(1, 56) as n
  where p.status = 'approved';

  -- One chat between buyer@tulay.test and Cebu SubliPrints: 1,200 messages from two days ago (outside the
  -- one-minute rate window), then the newest one, which the chat must show when opened.
  insert into public.direct_conversations (id, buyer_id, supplier_id, buyer_name, last_message_at)
  values ('c0ffee00-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111',
    'b1000000-0000-4000-8000-000000000003', 'Alex Reyes', now());

  insert into public.direct_messages (conversation_id, sender_id, body, idempotency_key, created_at)
  select 'c0ffee00-0000-4000-8000-000000000001',
    case when i % 2 = 0 then '11111111-1111-4111-8111-111111111111'::uuid else 'a1000000-0000-4000-8000-000000000003'::uuid end,
    'Load message ' || i, gen_random_uuid(), now() - interval '2 days' + make_interval(secs => i * 60)
  from generate_series(1, 1200) as i;

  insert into public.direct_messages (conversation_id, sender_id, body, idempotency_key, created_at)
  values ('c0ffee00-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000003',
    'NEWEST MESSAGE 1201', gen_random_uuid(), now());
end $$;

select (select count(*) from public.products where status = 'approved') as approved_listings,
  (select count(*) from public.direct_messages where conversation_id = 'c0ffee00-0000-4000-8000-000000000001') as chat_messages;
