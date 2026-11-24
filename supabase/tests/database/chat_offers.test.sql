-- Chat offers: revisions, counteroffers replace the open offer, acceptance names one exact open revision,
-- totals and downpayments are worked out on the server, and only the two parties see the negotiation.
begin;
create extension if not exists pgtap with schema extensions;
select plan(28);

insert into auth.users (id, email, raw_user_meta_data) values
  ('c4000000-0000-4000-8000-000000000001', 'co-buyer@test.ph', '{"role":"buyer"}'),
  ('c4000000-0000-4000-8000-000000000002', 'co-owner@test.ph', '{"role":"supplier"}'),
  ('c4000000-0000-4000-8000-000000000003', 'co-other@test.ph', '{"role":"buyer"}');
insert into public.suppliers (id, owner_id, business_name, legal_name, category_id, city, province, moq, lead_days, description, status)
values ('c5000000-0000-4000-8000-000000000001', 'c4000000-0000-4000-8000-000000000002', 'ABC Printing', 'ABC Printing',
  (select id from public.categories limit 1), 'Manila', 'Metro Manila', 1, 1, 'Test', 'verified');

create function pg_temp.as_user(p_id text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated', 'aal', 'aal1')::text, true);
$$;
-- make_chat_offer with the fields this test varies; the rest are fixed.
create function pg_temp.offer(p_related uuid, p_price bigint, p_qty integer, p_ship bigint, p_bps integer, p_key text) returns uuid
language sql as $$
  select public.make_chat_offer((select id from public.direct_conversations where supplier_id = 'c5000000-0000-4000-8000-000000000001'),
    p_related, 'Printed Shirt', 'Round neck', 'Cotton', 'pcs', p_qty, p_price, p_ship, 7, p_bps, '50% down, rest before shipping', '',
    p_key::uuid);
$$;
create function pg_temp.rev(p_revision integer) returns uuid language sql as $$
  select id from public.chat_offers where revision = p_revision and action in ('offer', 'counter')
    and conversation_id = (select id from public.direct_conversations where supplier_id = 'c5000000-0000-4000-8000-000000000001');
$$;
grant execute on function pg_temp.as_user(text), pg_temp.offer(uuid, bigint, integer, bigint, integer, text), pg_temp.rev(integer)
  to authenticated;
set local role authenticated;

-- The buyer opens the chat, then offers PHP 120 x 50.
select pg_temp.as_user('c4000000-0000-4000-8000-000000000001');
select public.send_direct_message(null, 'c5000000-0000-4000-8000-000000000001', 'Hi', 'd0000000-0000-4000-8000-000000000001');
select lives_ok($$ select pg_temp.offer(null, 12000, 50, 0, 5000, 'd1000000-0000-4000-8000-000000000001') $$, 'the buyer makes an offer');
select lives_ok($$ select pg_temp.offer(null, 12000, 50, 0, 5000, 'd1000000-0000-4000-8000-000000000001') $$, 'a retry with the same key succeeds');
select is((select count(*)::int from public.chat_offers), 1, 'the retry stores no second offer');
select results_eq($$ select revision, action::text, subtotal_centavos, total_centavos, downpayment_centavos from public.chat_offers $$,
  $$ values (1, 'offer', 600000::bigint, 600000::bigint, 300000::bigint) $$, 'the server works out the totals and the downpayment');
select is((select count(*)::int from public.direct_messages where kind = 'offer'), 1, 'the offer is posted in the chat');
select throws_ok($$ select pg_temp.offer(pg_temp.rev(1), 11000, 50, 0, 5000, 'd1000000-0000-4000-8000-000000000002') $$,
  '22023', null, 'the buyer cannot counter their own open offer');

-- The supplier counters at PHP 135.
select pg_temp.as_user('c4000000-0000-4000-8000-000000000002');
select throws_ok($$ select pg_temp.offer(null, 13500, 50, 0, 5000, 'd2000000-0000-4000-8000-000000000001') $$,
  '22023', null, 'a counter must name the open offer');
select throws_ok($$ select public.respond_chat_offer(pg_temp.rev(1), 'withdraw', 'd2000000-0000-4000-8000-000000000002') $$,
  '42501', null, 'only the sender can withdraw an offer');
select lives_ok($$ select pg_temp.offer(pg_temp.rev(1), 13500, 50, 0, 5000, 'd2000000-0000-4000-8000-000000000003') $$,
  'the supplier counters the open offer');
select is((select action::text from public.chat_offers where revision = 2), 'counter', 'the counter is revision 2');

-- The buyer cannot accept the outdated revision 1, and counters at PHP 125 with a PHP 250 delivery fee.
select pg_temp.as_user('c4000000-0000-4000-8000-000000000001');
select throws_ok($$ select public.respond_chat_offer(pg_temp.rev(1), 'accept', 'd1000000-0000-4000-8000-000000000003') $$,
  '22023', null, 'an outdated revision cannot be accepted');
select throws_ok($$ select public.respond_chat_offer(pg_temp.rev(2), 'withdraw', 'd1000000-0000-4000-8000-000000000004') $$,
  '42501', null, 'the buyer cannot withdraw the supplier''s offer');
select lives_ok($$ select pg_temp.offer(pg_temp.rev(2), 12500, 50, 25000, 5000, 'd1000000-0000-4000-8000-000000000005') $$,
  'the buyer counters back');
select results_eq($$ select total_centavos, downpayment_centavos, total_centavos - downpayment_centavos from public.chat_offers where revision = 3 $$,
  $$ values (650000::bigint, 325000::bigint, 325000::bigint) $$, 'PHP 6,500 at 50%: PHP 3,250 down and PHP 3,250 balance');
select throws_ok($$ select public.respond_chat_offer(pg_temp.rev(3), 'accept', 'd1000000-0000-4000-8000-000000000006') $$,
  '42501', null, 'nobody accepts their own offer');

-- The supplier accepts revision 3: the accepted row records exactly those terms.
select pg_temp.as_user('c4000000-0000-4000-8000-000000000002');
select lives_ok($$ select public.respond_chat_offer(pg_temp.rev(3), 'accept', 'd2000000-0000-4000-8000-000000000004') $$,
  'the supplier accepts the latest revision');
select results_eq($$ select revision, unit_price_centavos, quantity, total_centavos, related_offer_id from public.chat_offers where action = 'accept' $$,
  $$ values (3, 12500::bigint, 50, 650000::bigint, pg_temp.rev(3)) $$, 'the acceptance names revision 3 and copies its terms');
select throws_ok($$ select public.respond_chat_offer(pg_temp.rev(3), 'accept', 'd2000000-0000-4000-8000-000000000005') $$,
  '22023', null, 'an offer is accepted only once');
select is((select count(*)::int from public.chat_offers), 4, 'every revision and the acceptance are kept');

-- Downpayment rule at the PHP 1,000 line (setting downpayment_min_order_centavos).
select pg_temp.as_user('c4000000-0000-4000-8000-000000000001');
select lives_ok($$ select pg_temp.offer(null, 999, 100, 0, 0, 'd1000000-0000-4000-8000-000000000007') $$,
  'PHP 999 needs no downpayment');
select lives_ok($$ select public.respond_chat_offer(pg_temp.rev(4), 'withdraw', 'd1000000-0000-4000-8000-000000000008') $$,
  'the sender withdraws an open offer');
select throws_ok($$ select pg_temp.offer(null, 1000, 100, 0, 0, 'd1000000-0000-4000-8000-000000000009') $$,
  '22023', null, 'PHP 1,000 with no downpayment is refused');
select throws_ok($$ select pg_temp.offer(null, 1000, 100, 0, 10001, 'd1000000-0000-4000-8000-000000000010') $$,
  '22023', null, 'a downpayment above 100% is refused');
select lives_ok($$ select pg_temp.offer(null, 500, 100, 1000, 2000, 'd1000000-0000-4000-8000-000000000011') $$,
  'PHP 500 plus PHP 10 shipping with a 20% downpayment is accepted');

-- An expired offer cannot be accepted (valid_until moved back by the test only).
reset role;
alter table public.chat_offers disable trigger chat_offers_append_only;
update public.chat_offers set valid_until = now() - interval '1 minute' where id = pg_temp.rev(5);
alter table public.chat_offers enable trigger chat_offers_append_only;
set local role authenticated;
select pg_temp.as_user('c4000000-0000-4000-8000-000000000002');
select throws_ok($$ select public.respond_chat_offer(pg_temp.rev(5), 'accept', 'd2000000-0000-4000-8000-000000000006') $$,
  '22023', null, 'an expired offer cannot be accepted');

-- Privacy: another buyer sees none of it, and nobody writes to the table directly.
select pg_temp.as_user('c4000000-0000-4000-8000-000000000003');
select is((select count(*)::int from public.chat_offers), 0, 'another buyer sees no offers');
select throws_ok($$ insert into public.chat_offers (conversation_id, actor_id, action, revision, product_name, unit, quantity,
  unit_price_centavos, shipping_fee_centavos, lead_days, downpayment_bps, subtotal_centavos, total_centavos, downpayment_centavos,
  valid_until, idempotency_key) select id, auth.uid(), 'offer', 9, 'x', 'pcs', 1, 1, 0, 1, 0, 1, 1, 0, now(), gen_random_uuid()
  from public.direct_conversations $$, '42501', null, 'offers cannot be inserted directly');
select throws_ok($$ select public.respond_chat_offer(pg_temp.rev(5), 'reject', 'd3000000-0000-4000-8000-000000000001') $$,
  'P0002', null, 'an outsider cannot answer an offer');

select * from finish();
rollback;
