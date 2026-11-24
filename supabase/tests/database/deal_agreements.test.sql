-- Deal agreements and checkout: both parties confirm one exact version, checkout uses the accepted offer's exact
-- terms, a split order pays its downpayment then its balance online, and nothing ships before the balance is paid.
begin;
create extension if not exists pgtap with schema extensions;
select plan(35);

insert into auth.users (id, email, raw_user_meta_data) values
  ('e1000000-0000-4000-8000-000000000001', 'da-buyer@test.ph', '{"role":"buyer"}'),
  ('e1000000-0000-4000-8000-000000000002', 'da-owner@test.ph', '{"role":"supplier"}'),
  ('e1000000-0000-4000-8000-000000000003', 'da-other@test.ph', '{"role":"buyer"}');
insert into public.suppliers (id, owner_id, business_name, legal_name, category_id, city, province, moq, lead_days, description, status)
values ('e2000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000002', 'ABC Printing', 'ABC Printing',
  (select id from public.categories limit 1), 'Manila', 'Metro Manila', 1, 1, 'Test', 'verified');
insert into public.addresses (id, user_id, recipient, phone, line1, city, province)
values ('e3000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', 'Ana Buyer', '09171234567',
  '1 Alabang-Zapote Rd', 'Las Piñas', 'Metro Manila');

create function pg_temp.as_user(p_id text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated', 'aal', 'aal1')::text, true);
$$;
create function pg_temp.conv() returns uuid language sql as $$
  select id from public.direct_conversations where supplier_id = 'e2000000-0000-4000-8000-000000000001';
$$;
-- Latest accepted offer, latest agreement version, latest order of the test chat.
create function pg_temp.acc() returns uuid language sql as $$
  select id from public.chat_offers where action = 'accept' and conversation_id = pg_temp.conv() order by seq desc limit 1;
$$;
create function pg_temp.agr() returns uuid language sql as $$
  select id from public.deal_agreements where accept_id = pg_temp.acc() order by version desc limit 1;
$$;
create function pg_temp.ord() returns public.orders language sql as $$
  select o.* from public.orders o join public.deal_agreements g on g.id = o.agreement_id
  where g.accept_id = pg_temp.acc() order by o.created_at desc limit 1;
$$;
-- Buyer offers, supplier accepts, buyer sets the address, supplier sets the class, both confirm.
create function pg_temp.deal(p_price bigint, p_qty integer, p_ship bigint, p_bps integer, p_class text, p_n integer) returns void
language plpgsql as $$
begin
  perform pg_temp.as_user('e1000000-0000-4000-8000-000000000001');
  perform public.make_chat_offer(pg_temp.conv(), null, 'Printed Shirt', '', '', 'pcs', p_qty, p_price, p_ship, 7, p_bps, '', '',
    ('f0000000-0000-4000-8000-0000000001' || lpad(p_n::text, 2, '0'))::uuid);
  perform pg_temp.as_user('e1000000-0000-4000-8000-000000000002');
  perform public.respond_chat_offer((select id from public.chat_offers where conversation_id = pg_temp.conv()
    and action in ('offer', 'counter') order by seq desc limit 1), 'accept',
    ('f0000000-0000-4000-8000-0000000002' || lpad(p_n::text, 2, '0'))::uuid);
  perform pg_temp.as_user('e1000000-0000-4000-8000-000000000001');
  perform public.update_agreement(pg_temp.acc(), 'e3000000-0000-4000-8000-000000000001', null);
  perform pg_temp.as_user('e1000000-0000-4000-8000-000000000002');
  perform public.update_agreement(pg_temp.acc(), null, p_class::public.return_class);
  perform public.confirm_agreement(pg_temp.agr());
  perform pg_temp.as_user('e1000000-0000-4000-8000-000000000001');
  perform public.confirm_agreement(pg_temp.agr());
end $$;
-- The gateway confirms a checkout's payment (fee 0): attach a session as the buyer, then the webhook as service.
create function pg_temp.pay(p_checkout uuid, p_ref text) returns text language plpgsql as $$
declare r text;
begin
  perform pg_temp.as_user('e1000000-0000-4000-8000-000000000001');
  perform public.attach_payment_session(p_checkout, 'fake', p_ref);
  reset role;
  select public.confirm_payment('fake', 'evt-' || p_ref, p_ref,
    (select amount_centavos from public.payments where checkout_id = p_checkout), 0, '{}') into r;
  set local role authenticated;
  return r;
end $$;
grant execute on function pg_temp.as_user(text), pg_temp.conv(), pg_temp.acc(), pg_temp.agr(), pg_temp.ord(),
  pg_temp.deal(bigint, integer, bigint, integer, text, integer), pg_temp.pay(uuid, text) to authenticated;
set local role authenticated;

-- ---------------------------------------------------------------- deal 1: PHP 125 x 50 + PHP 250, 50% down (custom)
select pg_temp.as_user('e1000000-0000-4000-8000-000000000001');
select public.send_direct_message(null, 'e2000000-0000-4000-8000-000000000001', 'Hi', 'f0000000-0000-4000-8000-000000000000');
select public.make_chat_offer(pg_temp.conv(), null, 'Printed Shirt', 'Round neck', 'Cotton', 'pcs', 50, 12500, 25000, 7, 5000,
  '', '', 'f1000000-0000-4000-8000-000000000001');
select pg_temp.as_user('e1000000-0000-4000-8000-000000000002');
select public.respond_chat_offer((select id from public.chat_offers where action = 'offer'), 'accept', 'f1000000-0000-4000-8000-000000000002');

select throws_ok($$ select public.update_agreement(pg_temp.acc(), 'e3000000-0000-4000-8000-000000000001', null) $$,
  '42501', null, 'the supplier cannot set the delivery address');
select pg_temp.as_user('e1000000-0000-4000-8000-000000000001');
select throws_ok($$ select public.update_agreement(pg_temp.acc(), null, 'standard') $$,
  '42501', null, 'the buyer cannot set the return class');
select lives_ok($$ select public.update_agreement(pg_temp.acc(), 'e3000000-0000-4000-8000-000000000001', null) $$,
  'the buyer sets the delivery address');
select is((select ship_to ->> 'city' from public.deal_agreements where id = pg_temp.agr()), 'Las Piñas', 'the address is frozen into the agreement');
select throws_ok($$ select public.confirm_agreement(pg_temp.agr()) $$, '22023', null, 'incomplete details cannot be confirmed');

select pg_temp.as_user('e1000000-0000-4000-8000-000000000002');
select lives_ok($$ select public.update_agreement(pg_temp.acc(), null, 'custom') $$, 'the supplier sets the return class');
select lives_ok($$ select public.update_agreement(pg_temp.acc(), null, 'custom') $$, 'repeating the same change succeeds');
select is((select count(*)::int from public.deal_agreements where accept_id = pg_temp.acc()), 2, 'an unchanged repeat adds no version');
select ok((select terms_body like 'DRAFT, pending legal review.%' from public.deal_agreements where id = pg_temp.agr()),
  'the custom terms are copied into version 2');
select throws_ok($$ select public.confirm_agreement((select id from public.deal_agreements where accept_id = pg_temp.acc() and version = 1)) $$,
  '22023', null, 'an outdated version cannot be confirmed');
select lives_ok($$ select public.confirm_agreement(pg_temp.agr()) $$, 'the supplier confirms the latest version');

select pg_temp.as_user('e1000000-0000-4000-8000-000000000001');
select throws_ok($$ select * from public.start_agreement_checkout(pg_temp.agr(), 'f1000000-0000-4000-8000-000000000003', 'qrph') $$,
  '22023', null, 'checkout waits for both confirmations');
select lives_ok($$ select public.confirm_agreement(pg_temp.agr()) $$, 'the buyer confirms');
select pg_temp.as_user('e1000000-0000-4000-8000-000000000002');
select throws_ok($$ select * from public.start_agreement_checkout(pg_temp.agr(), 'f1000000-0000-4000-8000-000000000004', 'qrph') $$,
  '42501', null, 'only the buyer pays');

select pg_temp.as_user('e1000000-0000-4000-8000-000000000001');
select results_eq($$ select amount_centavos from public.start_agreement_checkout(pg_temp.agr(), 'f1000000-0000-4000-8000-000000000005', 'qrph') $$,
  $$ values (325000::bigint) $$, 'the buyer pays the agreed PHP 3,250 downpayment first');
select results_eq($$ select amount_centavos from public.start_agreement_checkout(pg_temp.agr(), 'f1000000-0000-4000-8000-000000000005', 'qrph') $$,
  $$ values (325000::bigint) $$, 'a retry with the same key returns the same checkout');
select results_eq($$ select total_centavos, shipping_centavos, downpayment_centavos, payment_option::text, status::text from pg_temp.ord() $$,
  $$ values (650000::bigint, 25000::bigint, 325000::bigint, 'split', 'pending_payment') $$,
  'the order carries the accepted terms exactly and is not paid yet');
select throws_ok($$ select * from public.start_agreement_checkout(pg_temp.agr(), 'f1000000-0000-4000-8000-000000000006', 'qrph') $$,
  '22023', null, 'a deal is ordered once');
select throws_ok($$ select public.update_agreement(pg_temp.acc(), 'e3000000-0000-4000-8000-000000000001', null) $$,
  '22023', null, 'details are locked once ordered');

select is(pg_temp.pay((select checkout_id from public.orders where id = (pg_temp.ord()).id), 'dp1'), 'paid', 'the gateway confirms the downpayment');
select results_eq($$ select status::text, paid_online_centavos from pg_temp.ord() $$,
  $$ values ('confirmed', 325000::bigint) $$, 'the order is confirmed with the downpayment paid');

-- Ready to ship (proof approved, in production) but the balance is unpaid: no courier booking.
reset role;
update public.orders set status = 'in_production', proof_approved_at = now() where id = (pg_temp.ord()).id;
set local role authenticated;
select pg_temp.as_user('e1000000-0000-4000-8000-000000000002');
select throws_ok($$ select public.check_can_book_shipment((pg_temp.ord()).id) $$,
  '22023', 'The buyer has not paid the balance yet', 'nothing ships before the balance is paid');
select lives_ok($$ select public.request_balance((pg_temp.ord()).id) $$, 'the supplier asks for the balance');

select pg_temp.as_user('e1000000-0000-4000-8000-000000000001');
select results_eq($$ select amount_centavos from public.start_balance_checkout((pg_temp.ord()).id, 'f1000000-0000-4000-8000-000000000007', 'qrph') $$,
  $$ values (325000::bigint) $$, 'the balance is PHP 3,250');
select throws_ok($$ select * from public.start_balance_checkout((pg_temp.ord()).id, 'f1000000-0000-4000-8000-000000000008', 'qrph') $$,
  '22023', null, 'one open balance payment at a time');
select is(pg_temp.pay((select id from public.checkouts where order_id = (pg_temp.ord()).id), 'bal1'), 'paid', 'the gateway confirms the balance');
select results_eq($$ select status::text, paid_online_centavos from pg_temp.ord() $$,
  $$ values ('in_production', 650000::bigint) $$, 'the order is fully paid and keeps its production status');
reset role;
select is((select sum(credit_centavos - debit_centavos) from public.ledger_entries
  where order_id = (pg_temp.ord()).id and account = 'supplier_payable'), 650000::numeric,
  'the supplier is owed both payments (no fee, 0% commission)');
set local role authenticated;
select pg_temp.as_user('e1000000-0000-4000-8000-000000000002');
select lives_ok($$ select public.check_can_book_shipment((pg_temp.ord()).id) $$, 'a fully paid order can ship');
select pg_temp.as_user('e1000000-0000-4000-8000-000000000001');
select throws_ok($$ select * from public.start_balance_checkout((pg_temp.ord()).id, 'f1000000-0000-4000-8000-000000000009', 'qrph') $$,
  '22023', null, 'a fully paid order has no balance');

-- ---------------------------------------------------------------- deal 2: PHP 500 total, 0% down: paid in full
select pg_temp.deal(500, 100, 0, 0, 'standard', 2);
select results_eq($$ select amount_centavos from public.start_agreement_checkout(pg_temp.agr(), 'f2000000-0000-4000-8000-000000000001', 'qrph') $$,
  $$ values (50000::bigint) $$, 'under PHP 1,000 with no downpayment the full total is due');
select is((pg_temp.ord()).payment_option::text, 'online', 'it is an ordinary online order');

-- ---------------------------------------------------------------- deal 3: cancelled with a balance payment open
select pg_temp.deal(2000, 100, 0, 5000, 'standard', 3);
select pg_temp.pay((select checkout_id from public.start_agreement_checkout(pg_temp.agr(), 'f3000000-0000-4000-8000-000000000001', 'qrph')), 'dp3');
select pg_temp.as_user('e1000000-0000-4000-8000-000000000001');
-- The buyer opens the balance payment page, then cancels the order while it is open; the payment lands afterwards.
select public.attach_payment_session(
  (select checkout_id from public.start_balance_checkout((pg_temp.ord()).id, 'f3000000-0000-4000-8000-000000000002', 'qrph')),
  'fake', 'bal3');
select lives_ok($$ select public.cancel_order((pg_temp.ord()).id, 'Changed plans') $$, 'the buyer cancels before production');
reset role;
select is(public.confirm_payment('fake', 'evt-bal3', 'bal3', 100000, 0, '{}'), 'needs_review',
  'a balance paid after cancelling goes to review for a refund');
set local role authenticated;

-- Privacy.
select pg_temp.as_user('e1000000-0000-4000-8000-000000000003');
select is((select count(*)::int from public.deal_agreements), 0, 'another buyer sees no agreements');

select * from finish();
rollback;
