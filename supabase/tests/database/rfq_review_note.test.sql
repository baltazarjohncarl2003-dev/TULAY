-- The RFQ review note is visible to the buyer and support only, never to invited suppliers.
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

insert into auth.users (id, email, raw_user_meta_data) values
  ('f9000000-0000-4000-8000-000000000001', 'nb@test.ph', '{"role":"buyer"}'),
  ('f9000000-0000-4000-8000-000000000002', 'ns@test.ph', '{"role":"supplier"}');
insert into public.suppliers (id, owner_id, business_name, legal_name, category_id, city, province, moq, lead_days, description, status)
values ('f9100000-0000-4000-8000-000000000001', 'f9000000-0000-4000-8000-000000000002', 'Note Co', 'Note Co',
  (select id from public.categories where slug = 'custom-shirts'), 'Pasig', 'Metro Manila', 1, 7, 'x', 'verified');
insert into public.rfqs (id, buyer_id, product, quantity, unit, idempotency_key, review_note)
values ('f9200000-0000-4000-8000-000000000001', 'f9000000-0000-4000-8000-000000000001', 'Note shirts', 10, 'pcs', gen_random_uuid(), 'Internal: buyer looks like a reseller');
insert into public.rfq_invites (rfq_id, supplier_id) values ('f9200000-0000-4000-8000-000000000001', 'f9100000-0000-4000-8000-000000000001');

create function pg_temp.as_user(u text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated', 'aal', 'aal1')::text, true); $$;

-- Invited supplier
select pg_temp.as_user('f9000000-0000-4000-8000-000000000002');
set local role authenticated;
select is((select count(*)::int from public.rfqs where id = 'f9200000-0000-4000-8000-000000000001'), 1, 'the invited supplier still sees the RFQ');
select throws_ok($$ select review_note from public.rfqs $$, '42501', null, 'the supplier cannot read the review note column');
select is((select count(*)::int from public.rfq_review_notes(array['f9200000-0000-4000-8000-000000000001'::uuid])), 0, 'the note function gives the supplier nothing');
reset role;

-- Buyer
select pg_temp.as_user('f9000000-0000-4000-8000-000000000001');
set local role authenticated;
select is((select note from public.rfq_review_notes(array['f9200000-0000-4000-8000-000000000001'::uuid])), 'Internal: buyer looks like a reseller', 'the buyer reads the note');
select lives_ok($$ select id, ref, budget_centavos, status from public.rfqs $$, 'the buyer still reads the other columns');
reset role;

-- Logged out
set local role anon;
select throws_ok($$ select * from public.rfq_review_notes(array['f9200000-0000-4000-8000-000000000001'::uuid]) $$, '42501', null, 'anonymous visitors cannot call it');
reset role;

select * from finish();
rollback;
