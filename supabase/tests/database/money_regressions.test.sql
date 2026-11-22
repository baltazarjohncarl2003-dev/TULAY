-- Regressions from the 2026-11-22 audit: each block failed before migration audit_money_fixes.
begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

update public.suppliers set status = 'suspended';

insert into auth.users (id, email, raw_user_meta_data) values
  ('f1000000-0000-4000-8000-000000000001', 'rb@test.ph', '{"role":"buyer"}'),
  ('f1000000-0000-4000-8000-000000000002', 'rs1@test.ph', '{"role":"supplier"}'),
  ('f1000000-0000-4000-8000-000000000003', 'rs2@test.ph', '{"role":"supplier"}'),
  ('f1000000-0000-4000-8000-000000000004', 'rf@test.ph', '{}');
update public.profiles set role = 'admin' where id = 'f1000000-0000-4000-8000-000000000004';
insert into public.admin_roles (user_id, sub_role) values ('f1000000-0000-4000-8000-000000000004', 'finance');
insert into public.suppliers (id, owner_id, business_name, legal_name, category_id, city, province, moq, lead_days, description, status)
select v.id, v.owner, v.name, v.name, (select id from public.categories where slug = 'custom-shirts'), 'Pasig', 'Metro Manila', 1, 7, 'x', 'verified'
from (values
  ('f2000000-0000-4000-8000-000000000001'::uuid, 'f1000000-0000-4000-8000-000000000002'::uuid, 'Regress A'),
  ('f2000000-0000-4000-8000-000000000002'::uuid, 'f1000000-0000-4000-8000-000000000003'::uuid, 'Regress B')
) as v (id, owner, name);
insert into public.products (id, supplier_id, category_id, title, description, moq, unit, indicative_price_centavos, return_class, status, idempotency_key, review_note)
select v.id, v.sup, (select id from public.categories where slug = 'custom-shirts'), v.title, 'x', 1, 'pcs', 10000, v.cls::public.return_class, 'approved', gen_random_uuid(), 'internal note'
from (values
  ('f3000000-0000-4000-8000-000000000001'::uuid, 'f2000000-0000-4000-8000-000000000001'::uuid, 'Stock A', 'standard'),
  ('f3000000-0000-4000-8000-000000000002'::uuid, 'f2000000-0000-4000-8000-000000000002'::uuid, 'Stock B', 'standard'),
  ('f3000000-0000-4000-8000-000000000003'::uuid, 'f2000000-0000-4000-8000-000000000001'::uuid, 'Custom A', 'custom')
) as v (id, sup, title, cls);
insert into public.addresses (id, user_id, label, recipient, phone, line1, line2, barangay, city, province, postal_code)
values ('f4000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'Office', 'Buyer', '09171234567', '1 St', '', 'Poblacion', 'Makati', 'Metro Manila', '1200');

create function pg_temp.as_user(u text, a text default 'aal1') returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated', 'aal', a)::text, true); $$;
create function pg_temp.buyer() returns text language sql as $$ select 'f1000000-0000-4000-8000-000000000001'::text $$;
create function pg_temp.finance() returns void language sql as $$ select pg_temp.as_user('f1000000-0000-4000-8000-000000000004', 'aal2') $$;
create function pg_temp.checkout(p text, ref text) returns table (cid uuid, oid uuid, amt bigint) language plpgsql as $$
declare c uuid; d bigint;
begin
  delete from public.cart_items where user_id = pg_temp.buyer()::uuid;
  insert into public.cart_items (user_id, product_id, quantity) values (pg_temp.buyer()::uuid, p::uuid, 1);
  perform pg_temp.as_user(pg_temp.buyer());
  select s.checkout_id, s.amount_centavos into c, d from public.start_checkout(gen_random_uuid(), 'qrph', 'f4000000-0000-4000-8000-000000000001', 'online') s;
  perform public.attach_payment_session(c, 'fake', ref);
  return query select c, (select o.id from public.orders o where o.checkout_id = c limit 1), d;
end $$;
create function pg_temp.paid(p text, ref text) returns table (cid uuid, oid uuid, amt bigint) language plpgsql as $$
declare r record;
begin
  select * into r from pg_temp.checkout(p, ref);
  perform public.confirm_payment('fake', 'evt_' || ref, ref, r.amt, null, '{}');
  return query select r.cid, r.oid, r.amt;
end $$;

-- 1. Cancelling after a courier is booked
create temp table o1 as select * from pg_temp.paid('f3000000-0000-4000-8000-000000000001', 'fake_r1');
select pg_temp.as_user('f1000000-0000-4000-8000-000000000002');
select public.record_shipment((select oid from o1), 'fake', 'FAKE-R00000000001');
select pg_temp.as_user(pg_temp.buyer());
select throws_ok($$ select public.cancel_order((select oid from o1)) $$, '22023', null, 'a booked order cannot be cancelled');
select is((select status::text from public.orders where id = (select oid from o1)), 'paid', 'the booked order stays paid');

-- 2. Refund cap on reissue
create temp table o2 as select * from pg_temp.paid('f3000000-0000-4000-8000-000000000001', 'fake_r2');
select pg_temp.finance();
create temp table r2a as select public.admin_create_refund((select oid from o2), (select amt from o2), 'first try', gen_random_uuid()) as id;
select public.complete_refund((select id from r2a), null, false);
create temp table r2b as select public.admin_create_refund((select oid from o2), (select amt from o2), 'second try', gen_random_uuid()) as id;
select public.complete_refund((select id from r2b), 'fr_r2', true);
select throws_ok($$ select public.admin_reissue_refund((select id from r2a), gen_random_uuid()) $$, '22023', null, 'reissue cannot pass what was paid');
select is((select sum(amount_centavos)::bigint from public.refunds where order_id = (select oid from o2) and status <> 'failed'), (select amt from o2), 'only one full refund exists');
select throws_ok($$ insert into public.refunds (order_id, payment_id, amount_centavos, reason, idempotency_key)
  select oid, (select id from public.payments where checkout_id = cid), 1, 'over cap', gen_random_uuid() from o2 $$, '22023', null, 'the trigger guards direct inserts too');

-- 3. A typed-in number cannot take over a booked parcel
create temp table oa as select * from pg_temp.paid('f3000000-0000-4000-8000-000000000001', 'fake_r3a');
create temp table ob as select * from pg_temp.paid('f3000000-0000-4000-8000-000000000002', 'fake_r3b');
select pg_temp.as_user('f1000000-0000-4000-8000-000000000002');
select public.record_manual_shipment((select oid from oa), 'ninjavan', '', 'ORD202600099');
select pg_temp.as_user('f1000000-0000-4000-8000-000000000003');
select lives_ok($$ select public.record_shipment((select oid from ob), 'ninjavan', 'ORD202600099') $$, 'a manual number does not block the real booking');
select is(public.record_tracking_event('ninjavan', 'nv_r3', 'ORD202600099', 'delivered', now(), 'Delivered', null, '{}'), 'recorded', 'the webhook is recorded');
select is((select status::text from public.orders where id = (select oid from ob)), 'delivered', 'the webhook moves the booked order');
select is((select status::text from public.orders where id = (select oid from oa)), 'shipped', 'the webhook does not touch the manual order');

-- 4. Returned custom order is paid out after the delay
create temp table oc as select * from pg_temp.paid('f3000000-0000-4000-8000-000000000003', 'fake_r4');
update public.orders set status = 'in_production', proof_approved_at = now() where id = (select oid from oc);
select pg_temp.as_user('f1000000-0000-4000-8000-000000000002');
select public.record_shipment((select oid from oc), 'fake', 'FAKE-R00000000004');
select public.record_tracking_event('fake', 'r4', 'FAKE-R00000000004', 'returned', now() - interval '8 days', 'refused', null, '{}');
select private.schedule_payouts();
select is((select count(*)::int from public.payout_items where order_id = (select oid from oc)), 1, 'kept payment on a returned custom order is scheduled');

-- 5. Unmatched refund uses the amount received
create temp table o5 as select * from pg_temp.checkout('f3000000-0000-4000-8000-000000000001', 'fake_r5');
select is(public.confirm_payment('fake', 'evt_r5a', 'fake_r5', (select amt - 1000 from o5), null, '{}'), 'needs_review', 'short payment needs review');

-- 6. A second event for the same unmatched payment
select is(public.confirm_payment('fake', 'evt_r5b', 'fake_r5', (select amt - 1000 from o5), null, '{}'), 'already_needs_review', 'second event is ignored');
select is((select sum(credit_centavos - debit_centavos)::bigint from public.ledger_entries where account = 'unmatched_payments'
  and payment_id = (select id from public.payments where checkout_id = (select cid from o5))), (select amt - 1000 from o5), 'ledger counts the payment once');
select pg_temp.finance();
create temp table r5 as select public.admin_refund_unmatched((select id from public.payments where checkout_id = (select cid from o5)), gen_random_uuid()) as id;
select is((select amount_centavos from public.refunds where id = (select id from r5)), (select amt - 1000 from o5), 'refund equals what was received');

-- 9. Site-wide contact limit
update public.platform_settings set value = '1' where key = 'contact_messages_per_hour';
delete from public.contact_messages;
select lives_ok($$ select public.submit_contact_message('general', 'A', 'a@test.ph', '', 'Hello there, first message') $$, 'first message accepted');
select throws_ok($$ select public.submit_contact_message('general', 'B', 'b@test.ph', '', 'Hello there, second message') $$, '22023', null, 'a new email cannot pass the site limit');

-- 11. Public columns
set local role anon;
select throws_ok($$ select review_note from public.products limit 1 $$, '42501', null, 'visitors cannot read review notes');
select throws_ok($$ select buyer_id from public.reviews limit 1 $$, '42501', null, 'visitors cannot read review buyers');
reset role;

select * from finish();
rollback;
