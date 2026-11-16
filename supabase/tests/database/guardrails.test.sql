-- Banned items and the TULAY AI rate limit. Run with `supabase test db`.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

-- Matching: whole words, plurals, multi-word phrases; no false hit inside another word.
select is(public.banned_terms_in(array['Firearms for sale', 'glue gun', 'FAKE   ID cards', 'ivorycoast mugs', 'mailer box']),
  array['firearm', null, 'fake id', null, null]::text[], 'banned_terms_in: plurals, phrases, whole words only');
select is(public.banned_terms_in('{}'), '{}'::text[], 'banned_terms_in: empty input');

-- Listings and RFQs are refused.
insert into auth.users (id, email, raw_user_meta_data) values
  ('e0000000-0000-4000-8000-000000000001', 'g1@test.ph', '{"role":"supplier"}');
insert into public.suppliers (id, owner_id, business_name, legal_name, category_id, city, province, moq, lead_days, description, status, business_type)
values ('e1000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'Guard', 'Guard', (select id from public.categories where slug = 'packaging'),
  'Pasig', 'Metro Manila', 1, 7, 'x', 'verified', 'manufacturer');

select throws_ok($$
  insert into public.products (supplier_id, category_id, title, description, moq, unit, return_class, listing_type, status, idempotency_key)
  values ('e1000000-0000-4000-8000-000000000001', (select id from public.categories where slug = 'packaging'), 'Box', 'Fits ammunition', 1, 'pcs', 'custom', 'product', 'draft', gen_random_uuid())
$$, '23514', '"ammunition" is not allowed on TULAY. Remove it and try again.', 'product with a banned term is refused');

select lives_ok($$
  insert into public.products (supplier_id, category_id, title, description, moq, unit, return_class, listing_type, status, idempotency_key)
  values ('e1000000-0000-4000-8000-000000000001', (select id from public.categories where slug = 'packaging'), 'Glue gun box', 'Clean', 1, 'pcs', 'custom', 'product', 'draft', gen_random_uuid())
$$, 'clean product is accepted');

select throws_ok($$ update public.products set description = 'counterfeit bags' where title = 'Glue gun box' $$,
  '23514', null, 'editing a product to add a banned term is refused');

select throws_ok($$
  insert into public.rfqs (buyer_id, product, quantity, unit, idempotency_key)
  values ('e0000000-0000-4000-8000-000000000001', 'Shabu', 1, 'pcs', gen_random_uuid())
$$, '23514', null, 'RFQ with a banned term is refused');

-- Admin functions need the verifier role.
select throws_ok($$ select public.admin_add_banned_term('vape') $$, '42501', null, 'non-admin cannot add banned terms');

-- Rate limit: per visitor per minute, and per day for the whole site.
update public.platform_settings set value = '2' where key = 'ai_requests_per_minute';
update public.platform_settings set value = '3' where key = 'ai_requests_per_day';
select ok(public.take_ai_call(repeat('a', 64)), 'first call allowed');
select ok(public.take_ai_call(repeat('a', 64)), 'second call allowed');
select ok(not public.take_ai_call(repeat('a', 64)), 'third call in a minute refused');
select ok(public.take_ai_call(repeat('b', 64)) and not public.take_ai_call(repeat('c', 64)), 'daily cap applies across visitors');
select throws_ok($$ select public.take_ai_call('1.2.3.4') $$, '22023', null, 'raw IPs are rejected');

select * from finish();
rollback;
