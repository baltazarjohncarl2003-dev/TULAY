-- Stage 3 deals: RFQ lifecycle, invites, quotes, negotiation, selection, messages, notifications.
begin;
create extension if not exists pgtap with schema extensions;
select plan(53);

-- Hide local seed data (supabase/seed.sql) so counts only see this file's fixtures; rolled back at the end.
update public.suppliers set status = 'suspended';

-- Users: buyer B (also owns a supplier), second buyer B2, suppliers S1 (auto-invites) and S2, support admin.
insert into auth.users (id, email, raw_user_meta_data) values
  ('d1000000-0000-4000-8000-000000000001', 'db@test.ph', '{"role":"buyer"}'),
  ('d1000000-0000-4000-8000-000000000002', 'db2@test.ph', '{"role":"buyer"}'),
  ('d1000000-0000-4000-8000-000000000003', 'ds1@test.ph', '{"role":"supplier"}'),
  ('d1000000-0000-4000-8000-000000000004', 'ds2@test.ph', '{"role":"supplier"}'),
  ('d1000000-0000-4000-8000-000000000005', 'dadm@test.ph', '{}');
update public.profiles set role = 'admin' where id = 'd1000000-0000-4000-8000-000000000005';
insert into public.admin_roles (user_id, sub_role) values ('d1000000-0000-4000-8000-000000000005', 'support');
insert into public.suppliers (id, owner_id, business_name, legal_name, category_id, city, province, moq, lead_days, description,
  status, delivery_areas, auto_invites)
select v.id, v.owner, v.name, v.name, (select id from public.categories where slug = 'custom-shirts'), 'Pasig', 'Metro Manila',
  10, 7, 'x', 'verified', '{"Metro Manila"}', v.auto
from (values
  ('d2000000-0000-4000-8000-000000000001'::uuid, 'd1000000-0000-4000-8000-000000000003'::uuid, 'S1 Prints', true),
  ('d2000000-0000-4000-8000-000000000002'::uuid, 'd1000000-0000-4000-8000-000000000004'::uuid, 'S2 Prints', false),
  ('d2000000-0000-4000-8000-000000000003'::uuid, 'd1000000-0000-4000-8000-000000000001'::uuid, 'Buyer Own Prints', true)
) as v (id, owner, name, auto);

create function pg_temp.as_user(p_id text, p_aal text default 'aal1') returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated', 'aal', p_aal)::text, true);
$$;
create function pg_temp.rfq() returns uuid language sql as $$ select id from public.rfqs where product = 'Staff shirts' $$;
grant execute on function pg_temp.as_user(text, text), pg_temp.rfq() to authenticated;
set local role authenticated;

-- ------------------------------------------------------------ buyer drafts and submits
select pg_temp.as_user('d1000000-0000-4000-8000-000000000001');
select lives_ok($$ select public.save_rfq(null, 'e1000000-0000-4000-8000-000000000001', 'Staff shirts', 'custom-shirts', 'Logo shirts',
  'Cotton 180gsm', 40, 'pcs', 'Quezon City', 'Metro Manila', current_date + 30, 1400000, false, 'any', true, false) $$, 'buyer saves a draft');
select lives_ok($$ select public.save_rfq(null, 'e1000000-0000-4000-8000-000000000001', 'Staff shirts', null, '', '', null, 'pcs',
  '', '', null, null, false, 'any', false, false) $$, 'retry with the same key');
select is((select count(*)::int from public.rfqs where buyer_id = auth.uid()), 1, 'retry created nothing new');
select is((select status::text from public.rfqs where id = pg_temp.rfq()), 'draft', 'starts as a draft');
select throws_ok($$ select public.save_rfq(null, gen_random_uuid(), 'Bags', null, '', '', null, 'pcs', '', '', null, null, true, 'any', false, true) $$,
  '22023', null, 'incomplete request cannot be submitted');
select throws_ok($$ select public.save_rfq(pg_temp.rfq(), null, 'Staff shirts', 'custom-shirts', 'Logo shirts', 'Cotton 180gsm', 40, 'pcs',
  'Quezon City', 'Metro Manila', current_date + 30, 1400000, false, 'any', true, true) $$, '22023', null, 'sharing consent is required');
select lives_ok($$ select public.save_rfq(pg_temp.rfq(), null, 'Staff shirts', 'custom-shirts', 'Logo shirts', 'Cotton 180gsm', 40, 'pcs',
  'Quezon City', 'Metro Manila', current_date + 30, 1400000, true, 'any', true, true) $$, 'buyer submits');
select is((select status::text from public.rfqs where id = pg_temp.rfq()), 'under_review', 'submitted for review');
select throws_ok($$ select public.admin_review_rfq(pg_temp.rfq(), 'approve') $$, '42501', null, 'buyer cannot approve');

select pg_temp.as_user('d1000000-0000-4000-8000-000000000002');
select is((select count(*)::int from public.rfqs), 0, 'another buyer sees nothing');
select pg_temp.as_user('d1000000-0000-4000-8000-000000000003');
select is((select count(*)::int from public.rfqs), 0, 'suppliers see nothing before an invite');

-- ------------------------------------------------------------ admin review and invites
select pg_temp.as_user('d1000000-0000-4000-8000-000000000005', 'aal2');
select throws_ok($$ select public.admin_review_rfq(pg_temp.rfq(), 'reject', '') $$, '22023', null, 'rejecting needs a note');
select lives_ok($$ select public.admin_review_rfq(pg_temp.rfq(), 'approve') $$, 'support approves');
select is((select status::text from public.rfqs where id = pg_temp.rfq()), 'invited', 'approval auto-invited');
select is((select array_agg(supplier_id::text) from public.rfq_invites where rfq_id = pg_temp.rfq()),
  array['d2000000-0000-4000-8000-000000000001'], 'only the opted-in supplier, never the buyer''s own');
select is((select count(*)::int from public.admin_suggest_suppliers(pg_temp.rfq())), 2, 'suggestions exclude the buyer''s own supplier');
select throws_ok($$ select public.admin_invite_suppliers(pg_temp.rfq(), array['d2000000-0000-4000-8000-000000000003'::uuid]) $$,
  '22023', null, 'cannot invite the buyer''s own supplier');
select is(public.admin_invite_suppliers(pg_temp.rfq(), array['d2000000-0000-4000-8000-000000000002'::uuid]), 1, 'support invites S2');

-- ------------------------------------------------------------ supplier quotes
select pg_temp.as_user('d1000000-0000-4000-8000-000000000003');
select is((select count(*)::int from public.rfqs), 1, 'invited supplier sees the request');
select is((select count(*)::int from public.profiles where id = 'd1000000-0000-4000-8000-000000000001'), 0, 'buyer stays anonymous');
select throws_ok($$ select public.submit_quote(pg_temp.rfq(), gen_random_uuid(), 40, 32000, 50000, null, 0, 7, current_date + 10,
  '50% down', '', 'supplier_delivery', 'vat', '[{"minQty": 40, "unitPriceCentavos": 29000}]') $$, '22023', null, 'tier must start above the quantity');
select throws_ok($$ select public.submit_quote(pg_temp.rfq(), gen_random_uuid(), 40, 32000, 50000, null, 0, 7, current_date - 1,
  '50% down', '', 'supplier_delivery', 'vat') $$, '22023', null, 'valid-until cannot be in the past');
select lives_ok($$ select public.submit_quote(pg_temp.rfq(), 'e2000000-0000-4000-8000-000000000001', 40, 32000, 50000, null, 0, 7,
  current_date + 10, '50% down', '', 'supplier_delivery', 'vat', '[{"minQty": 100, "unitPriceCentavos": 29000}]') $$, 'supplier quotes');
select lives_ok($$ select public.submit_quote(pg_temp.rfq(), 'e2000000-0000-4000-8000-000000000001', 40, 1, 1, 1, 1, 1,
  current_date + 10, 'x', '', 'supplier_delivery', 'vat') $$, 'retry with the same key');
select is((select count(*)::int from public.quotes), 1, 'retry created no second quote');
select is((select status::text from public.rfqs where id = pg_temp.rfq()), 'quoting', 'first quote opens quoting');

select pg_temp.as_user('d1000000-0000-4000-8000-000000000004');
select is((select count(*)::int from public.quotes), 0, 'a competitor cannot see the quote');
select lives_ok($$ select public.respond_rfq_invite(pg_temp.rfq(), false) $$, 'S2 declines');
select throws_ok($$ select public.submit_quote(pg_temp.rfq(), gen_random_uuid(), 40, 30000, null, null, null, 7, current_date + 10,
  'COD', '', 'buyer_pickup', 'none') $$, '22023', null, 'declined supplier cannot quote');
select throws_ok($$ select public.send_rfq_message(pg_temp.rfq(), 'd2000000-0000-4000-8000-000000000002', 'hi') $$,
  '22023', null, 'declined thread is closed');

-- ------------------------------------------------------------ negotiation
select pg_temp.as_user('d1000000-0000-4000-8000-000000000001');
select is((select count(*)::int from public.quotes), 1, 'buyer sees the quote');
select lives_ok($$ select public.make_offer(pg_temp.rfq(), 'd2000000-0000-4000-8000-000000000001', gen_random_uuid(), 'counter', null,
  40, 28000, 7, '50% down', 'Can you do 280?') $$, 'buyer counters');
select throws_ok($$ select public.make_offer(pg_temp.rfq(), 'd2000000-0000-4000-8000-000000000001', gen_random_uuid(), 'counter', null,
  40, 27000, 7, '50% down', '') $$, '22023', null, 'must wait for a reply');
select lives_ok($$ select public.send_rfq_message(pg_temp.rfq(), 'd2000000-0000-4000-8000-000000000001', 'Logo in white please') $$,
  'buyer messages the supplier');

select pg_temp.as_user('d1000000-0000-4000-8000-000000000003');
select lives_ok($$ select public.make_offer(pg_temp.rfq(), 'd2000000-0000-4000-8000-000000000001', gen_random_uuid(), 'accept',
  (select id from public.offers), null, null, null, null, 'Deal') $$, 'supplier accepts the counter');
select throws_ok($$ select public.make_offer(pg_temp.rfq(), 'd2000000-0000-4000-8000-000000000001', gen_random_uuid(), 'accept',
  (select id from public.offers where action = 'counter'), null, null, null, null, '') $$, '22023', null, 'nothing left to accept');
select is((select unit_price_centavos from public.offers where action = 'accept'), 28000::bigint, 'accept copies the counter''s terms');

select pg_temp.as_user('d1000000-0000-4000-8000-000000000002');
select throws_ok($$ select public.send_rfq_message(pg_temp.rfq(), 'd2000000-0000-4000-8000-000000000001', 'hi') $$,
  'P0002', null, 'outsiders cannot message');

-- ------------------------------------------------------------ selection
select pg_temp.as_user('d1000000-0000-4000-8000-000000000001');
select lives_ok($$ select public.select_supplier(pg_temp.rfq(), (select id from public.quotes), (select id from public.offers where action = 'accept')) $$,
  'buyer selects on the accepted counter');
select is((select amount_centavos from public.selections), 1170000::bigint, '40 x 280.00 + 500.00 setup + 0 tax, in centavos');
select ok((select amount_is_estimate from public.selections), 'shipping left blank -> estimate');
select is((select status::text from public.rfqs where id = pg_temp.rfq()), 'supplier_selected', 'request closed');
select throws_ok($$ select public.cancel_rfq(pg_temp.rfq()) $$, '22023', null, 'cannot cancel after selection');

select pg_temp.as_user('d1000000-0000-4000-8000-000000000003');
select is((select count(*)::int from public.profiles where id = 'd1000000-0000-4000-8000-000000000001'), 1, 'selected supplier sees the buyer');
select ok(exists (select 1 from public.notifications where title = 'You were selected'), 'selected supplier is notified');
select pg_temp.as_user('d1000000-0000-4000-8000-000000000004');
select is((select count(*)::int from public.profiles where id = 'd1000000-0000-4000-8000-000000000001'), 0, 'other suppliers do not');

-- ------------------------------------------------------------ paying for the deal (Stage 4)
reset role;
insert into public.addresses (user_id, recipient, phone, line1, city, province)
values ('d1000000-0000-4000-8000-000000000001', 'Buyer', '09171234567', '1 Test St', 'Quezon City', 'Metro Manila');
set local role authenticated;
select pg_temp.as_user('d1000000-0000-4000-8000-000000000001');
select is((select amount_centavos from public.start_selection_checkout((select id from public.selections), gen_random_uuid(), 'card', (select id from public.addresses))),
  1170000::bigint, 'deal checkout charges the recorded amount');
select is((select fees_centavos from public.orders), 50000::bigint, 'quoted fees are kept apart from the items');
select throws_ok($$ select * from public.start_selection_checkout((select id from public.selections), gen_random_uuid(), 'card', (select id from public.addresses)) $$,
  '22023', null, 'a deal has one open checkout');
select pg_temp.as_user('d1000000-0000-4000-8000-000000000003');
select is((select count(*)::int from public.orders), 0, 'supplier sees the order only once paid');

-- ------------------------------------------------------------ limits and history
reset role;
update public.platform_settings set value = '1' where key = 'rfq_max_per_day';
set local role authenticated;
select pg_temp.as_user('d1000000-0000-4000-8000-000000000001');
select throws_ok($$ select public.save_rfq(null, gen_random_uuid(), 'Mugs', 'customized-mugs', 'Gift mugs', '11 oz', 100, 'pcs',
  'Quezon City', 'Metro Manila', current_date + 30, null, true, 'any', false, true) $$, '22023', null, 'daily request limit applies');

reset role;
select throws_ok($$ delete from public.quotes $$, '42501', null, 'quotes are append-only');
select ok((select count(*) from public.audit_log where action in ('rfq.submit', 'rfq.review', 'quote.submit', 'offer.accept', 'rfq.select')) = 5,
  'every step audited');

select * from finish();
rollback;
