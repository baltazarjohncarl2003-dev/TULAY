-- Stage 6 after-sales: claims, windows, evidence, supplier response, escalation, refunds (online and COD),
-- replacements, restocking fee, reviews, order completion.
begin;
create extension if not exists pgtap with schema extensions;
select plan(42);

-- Hide local seed data (supabase/seed.sql) so counts only see this file's fixtures; rolled back at the end.
update public.suppliers set status = 'suspended';
update public.platform_settings set value = '0' where key = 'shipping_flat_fee_centavos';
update public.platform_settings set value = '1000000' where key = 'cod_max_order_centavos';
update public.platform_settings set value = '500' where key = 'restocking_fee_max_bps'; -- 5% cap

insert into auth.users (id, email, raw_user_meta_data) values
  ('a5000000-0000-4000-8000-000000000001', 'ab@test.ph', '{"role":"buyer"}'),
  ('a5000000-0000-4000-8000-000000000002', 'as@test.ph', '{"role":"supplier"}'),
  ('a5000000-0000-4000-8000-000000000003', 'ao@test.ph', '{"role":"buyer"}'),
  ('a5000000-0000-4000-8000-000000000004', 'aa@test.ph', '{}');
update public.profiles set role = 'admin' where id = 'a5000000-0000-4000-8000-000000000004';
insert into public.admin_roles (user_id, sub_role) values ('a5000000-0000-4000-8000-000000000004', 'support');
insert into public.suppliers (id, owner_id, business_name, legal_name, category_id, city, province, moq, lead_days, description, status, restocking_fee_bps)
values ('a6000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000002', 'Shop', 'Shop',
  (select id from public.categories where slug = 'mailers'), 'Pasig', 'Metro Manila', 1, 7, 'x', 'verified', 1000); -- asks 10%, cap is 5%
insert into public.products (id, supplier_id, category_id, title, description, moq, unit, indicative_price_centavos, return_class, status, idempotency_key)
select v.id, 'a6000000-0000-4000-8000-000000000001', (select id from public.categories where slug = 'mailers'), v.title, 'x', 1, 'pcs',
  v.price, v.rc::public.return_class, 'approved', gen_random_uuid()
from (values
  ('a7000000-0000-4000-8000-000000000001'::uuid, 'Stock box', 10000::bigint, 'standard'),
  ('a7000000-0000-4000-8000-000000000002'::uuid, 'Printed box', 20000::bigint, 'custom')
) as v (id, title, price, rc);
insert into public.addresses (id, user_id, recipient, phone, line1, city, province)
values ('a8000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000001', 'Buyer', '09171234567', '1 St', 'Pasig', 'Metro Manila');

-- Buys one unit through the real checkout and marks it delivered (runs as postgres, acting as the buyer).
create function pg_temp.delivered_order(p_product text, p_option text) returns uuid language plpgsql as $$
declare co record; oid uuid; ref text := 'ref-' || gen_random_uuid();
begin
  perform set_config('request.jwt.claims', '{"sub":"a5000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
  delete from public.cart_items where user_id = 'a5000000-0000-4000-8000-000000000001';
  insert into public.cart_items (user_id, product_id, quantity) values ('a5000000-0000-4000-8000-000000000001', p_product::uuid, 1);
  select * into co from public.start_checkout(gen_random_uuid(), 'ewallet', 'a8000000-0000-4000-8000-000000000001', p_option::public.payment_option);
  if co.amount_centavos > 0 then
    perform public.attach_payment_session(co.checkout_id, 'fake', ref);
    perform public.confirm_payment('fake', 'evt-' || ref, ref, co.amount_centavos, 0, '{}');
  end if;
  select id into oid from public.orders where checkout_id = co.checkout_id;
  update public.orders set status = 'delivered', delivered_at = now() where id = oid;
  return oid;
end $$;
create function pg_temp.as_user(p_id text, p_aal text default 'aal1') returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated', 'aal', p_aal)::text, true);
$$;
create temp table ids (k text primary key, v uuid);
insert into ids values
  ('std', pg_temp.delivered_order('a7000000-0000-4000-8000-000000000001', 'online')),
  ('cus', pg_temp.delivered_order('a7000000-0000-4000-8000-000000000002', 'online')),
  ('cod', pg_temp.delivered_order('a7000000-0000-4000-8000-000000000001', 'cod')),
  ('c1', 'c9000000-0000-4000-8000-000000000001'), ('c2', 'c9000000-0000-4000-8000-000000000002'),
  ('c3', 'c9000000-0000-4000-8000-000000000003'), ('c4', 'c9000000-0000-4000-8000-000000000004');
create function pg_temp.id(p_k text) returns uuid language sql as $$ select v from ids where k = p_k $$;
create function pg_temp.ev(p_order text, p_claim text) returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object('path', pg_temp.id(p_order) || '/claims/' || pg_temp.id(p_claim) || '/photo.jpg', 'fileName', 'photo.jpg'))
$$;
grant select on ids to authenticated;
grant execute on all functions in schema pg_temp to authenticated;
set local role authenticated;

-- ------------------------------------------------------------ opening a claim
select pg_temp.as_user('a5000000-0000-4000-8000-000000000001');
select throws_ok($$ select public.open_claim(pg_temp.id('c1'), pg_temp.id('cus'), 'return', '{}', 'I changed my mind about these boxes', pg_temp.ev('cus', 'c1')) $$,
  '22023', null, 'custom items cannot be returned for a change of mind');
select throws_ok($$ select public.open_claim(pg_temp.id('c1'), pg_temp.id('std'), 'return', '{}', 'I changed my mind about these boxes', '[]') $$,
  '22023', null, 'a photo or video is required');
select throws_ok($$ select public.open_claim(pg_temp.id('c1'), pg_temp.id('std'), 'return', '{}', 'I changed my mind about these boxes',
  '[{"path": "elsewhere/photo.jpg", "fileName": "x"}]') $$, '22023', null, 'evidence must be in this claim''s folder');
select throws_ok($$ select public.open_claim(pg_temp.id('c1'), pg_temp.id('std'), 'defect', '{}', 'The print is peeling off already', pg_temp.ev('std', 'c1')) $$,
  '22023', null, 'print defects apply to custom items');
select lives_ok($$ select public.open_claim(pg_temp.id('c1'), pg_temp.id('std'), 'return', '{}', 'I changed my mind about these boxes', pg_temp.ev('std', 'c1')) $$,
  'buyer opens a return inside the window');
select lives_ok($$ select public.open_claim(pg_temp.id('c1'), pg_temp.id('std'), 'return', '{}', 'I changed my mind about these boxes', pg_temp.ev('std', 'c1')) $$,
  'retry with the same claim id');
select is((select count(*)::int from public.claims), 1, 'retry created no second claim');
select throws_ok($$ select public.open_claim(gen_random_uuid(), pg_temp.id('std'), 'damage', '{}', 'Box arrived crushed on one side', '[{"path":"x","fileName":"x"}]') $$,
  '22023', null, 'one open claim per order');
select throws_ok($$ select public.escalate_claim(pg_temp.id('c1')) $$, '22023', null, 'cannot escalate before the supplier answers or the deadline passes');
select pg_temp.as_user('a5000000-0000-4000-8000-000000000003');
select is((select count(*)::int from public.claims), 0, 'other buyers cannot see the claim');

-- ------------------------------------------------------------ return with restocking fee
select pg_temp.as_user('a5000000-0000-4000-8000-000000000002');
select throws_ok($$ select public.respond_claim(pg_temp.id('c1'), true, 'refund', 10001, false, '') $$, '22023', null, 'refund capped at the order total');
select lives_ok($$ select public.respond_claim(pg_temp.id('c1'), true, 'refund', 10000, false, 'OK, please send it back') $$, 'supplier accepts the return');
select is((select status::text || ':' || return_payer || ':' || (ra_number is not null) from public.claims where id = pg_temp.id('c1')),
  'awaiting_return:buyer:true', 'return authorised; buyer pays the return shipping');
select is((select restocking_fee_centavos from public.claims where id = pg_temp.id('c1')), 500::bigint, 'restocking fee at the 5% platform cap, not the 10% asked');
select pg_temp.as_user('a5000000-0000-4000-8000-000000000001');
select lives_ok($$ select public.record_return_shipment(pg_temp.id('c1'), 'LBC-123') $$, 'buyer records the return tracking');
select pg_temp.as_user('a5000000-0000-4000-8000-000000000002');
select lives_ok($$ select public.confirm_return_received(pg_temp.id('c1')) $$, 'supplier receives the item');
select is((select r.amount_centavos from public.refunds r join public.claims c on c.online_refund_id = r.id where c.id = pg_temp.id('c1')),
  9500::bigint, 'online refund = 100.00 - 5.00 restocking fee');
select is((select status::text from public.claims where id = pg_temp.id('c1')), 'resolved', 'claim resolved');

-- ------------------------------------------------------------ defect: rejected, escalated, decided by TULAY
select pg_temp.as_user('a5000000-0000-4000-8000-000000000001');
select lives_ok($$ select public.open_claim(pg_temp.id('c2'), pg_temp.id('cus'), 'defect', '{}', 'The print cracked after one wash', pg_temp.ev('cus', 'c2')) $$,
  'buyer reports a print defect');
select pg_temp.as_user('a5000000-0000-4000-8000-000000000002');
select throws_ok($$ select public.respond_claim(pg_temp.id('c2'), false, null, null, null, '') $$, '22023', null, 'rejecting needs a reason');
select lives_ok($$ select public.respond_claim(pg_temp.id('c2'), false, null, null, null, 'Washed with bleach') $$, 'supplier rejects');
select pg_temp.as_user('a5000000-0000-4000-8000-000000000001');
select lives_ok($$ select public.escalate_claim(pg_temp.id('c2'), 'No bleach was used') $$, 'buyer escalates to TULAY');
select pg_temp.as_user('a5000000-0000-4000-8000-000000000004', 'aal1');
select throws_ok($$ select public.admin_decide_claim(pg_temp.id('c2'), 'refund', 10000, false, 'Defect confirmed') $$, '42501', null, 'support needs MFA');
select pg_temp.as_user('a5000000-0000-4000-8000-000000000004', 'aal2');
select lives_ok($$ select public.admin_decide_claim(pg_temp.id('c2'), 'refund', 10000, false, 'Photos show a print defect') $$, 'support decides a partial refund');
select is((select status::text from public.claims where id = pg_temp.id('c2')), 'resolved', 'refunded without a return');
select is((select r.amount_centavos from public.refunds r join public.claims c on c.online_refund_id = r.id where c.id = pg_temp.id('c2')),
  10000::bigint, 'no restocking fee on defects');

-- ------------------------------------------------------------ COD money is paid back by the supplier
select pg_temp.as_user('a5000000-0000-4000-8000-000000000001');
select lives_ok($$ select public.open_claim(pg_temp.id('c3'), pg_temp.id('cod'), 'damage', '{}', 'Box arrived crushed on one side', pg_temp.ev('cod', 'c3')) $$,
  'buyer reports damage on a COD order');
select pg_temp.as_user('a5000000-0000-4000-8000-000000000002');
select lives_ok($$ select public.respond_claim(pg_temp.id('c3'), true, 'refund', 10000, false, 'Sorry about that') $$, 'supplier accepts');
select is((select status::text || ':' || manual_refund_centavos || ':' || (online_refund_id is null) from public.claims where id = pg_temp.id('c3')),
  'refund_pending:10000:true', 'cash refund owed directly by the supplier; nothing through TULAY');
select throws_ok($$ select public.record_manual_refund(pg_temp.id('c3'), '') $$, '22023', null, 'transfer reference required');
select lives_ok($$ select public.record_manual_refund(pg_temp.id('c3'), 'GCash 1234567') $$, 'supplier records the GCash transfer');

-- ------------------------------------------------------------ replacement
select pg_temp.as_user('a5000000-0000-4000-8000-000000000001');
select public.open_claim(pg_temp.id('c4'), pg_temp.id('std'), 'damage', '{}', 'Second box arrived with a torn corner', pg_temp.ev('std', 'c4'));
select pg_temp.as_user('a5000000-0000-4000-8000-000000000002');
select lives_ok($$ select public.respond_claim(pg_temp.id('c4'), true, 'replacement', null, false, 'Sending a new one') $$, 'supplier offers a replacement');
select lives_ok($$ select public.mark_replacement_sent(pg_temp.id('c4'), 'via courier') $$, 'replacement sent');
select is((select status::text from public.claims where id = pg_temp.id('c4')), 'resolved', 'replacement resolves the claim');

-- ------------------------------------------------------------ windows, reviews, completion
reset role;
update public.orders set delivered_at = now() - interval '40 days' where id = pg_temp.id('cod');
set local role authenticated;
select pg_temp.as_user('a5000000-0000-4000-8000-000000000001');
select throws_ok($$ select public.open_claim(gen_random_uuid(), pg_temp.id('cod'), 'return', '{}', 'I changed my mind about these boxes', '[{"path":"x","fileName":"x"}]') $$,
  '22023', null, 'the 30-day return window has passed');
select lives_ok($$ select public.post_review(pg_temp.id('std'), 5, 'Great boxes, fast replies') $$, 'buyer reviews a delivered order');
select throws_ok($$ select public.post_review(pg_temp.id('std'), 1, 'again') $$, '22023', null, 'one review per order');
select pg_temp.as_user('a5000000-0000-4000-8000-000000000002');
select lives_ok($$ select public.reply_review((select id from public.reviews), 'Thank you!') $$, 'supplier replies once');
select throws_ok($$ select public.reply_review((select id from public.reviews), 'Again') $$, '22023', null, 'only one reply');
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is((select average_rating || '/' || review_count from public.supplier_ratings), '5.0/1', 'public rating from visible reviews');

reset role;
update public.orders set delivered_at = now() - interval '61 days' where id = pg_temp.id('cus');
select ok(private.complete_orders() >= 1, 'orders past every report window become completed');
insert into public.claim_messages (claim_id, sender_id, body) values (pg_temp.id('c1'), 'a5000000-0000-4000-8000-000000000001', 'hello');
select throws_ok($$ delete from public.claim_messages $$, '42501', null, 'claim messages are append-only');

select * from finish();
rollback;
