-- Stage 5 delivery: addresses, shipping fee, COD (+ custom downpayment), proofs, production, courier tracking,
-- returns and non-courier delivery confirmation.
begin;
create extension if not exists pgtap with schema extensions;
select plan(42);

-- Hide local seed data (supabase/seed.sql) so counts only see this file's fixtures; rolled back at the end.
update public.suppliers set status = 'suspended';

insert into auth.users (id, email, raw_user_meta_data) values
  ('f5000000-0000-4000-8000-000000000001', 'lb@test.ph', '{"role":"buyer"}'),
  ('f5000000-0000-4000-8000-000000000002', 'ls@test.ph', '{"role":"supplier"}'),
  ('f5000000-0000-4000-8000-000000000003', 'lo@test.ph', '{"role":"buyer"}');
insert into public.suppliers (id, owner_id, business_name, legal_name, category_id, city, province, moq, lead_days, description, status)
values ('f6000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000002', 'Print Co', 'Print Co',
  (select id from public.categories where slug = 'mailers'), 'Pasig', 'Metro Manila', 1, 7, 'x', 'verified');
insert into public.products (id, supplier_id, category_id, title, description, moq, unit, indicative_price_centavos, return_class, status, idempotency_key)
select v.id, 'f6000000-0000-4000-8000-000000000001', (select id from public.categories where slug = 'mailers'), v.title, 'x', 1, 'pcs',
  v.price, v.rc::public.return_class, 'approved', gen_random_uuid()
from (values
  ('f7000000-0000-4000-8000-000000000001'::uuid, 'Stock box', 10000::bigint, 'standard'),
  ('f7000000-0000-4000-8000-000000000002'::uuid, 'Printed box', 20000::bigint, 'custom')
) as v (id, title, price, rc);
insert into public.addresses (id, user_id, recipient, phone, line1, city, province) values
  ('f8000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000001', 'Buyer', '09171234567', '1 Test St', 'Pasig', 'Metro Manila'),
  ('f8000000-0000-4000-8000-000000000002', 'f5000000-0000-4000-8000-000000000003', 'Other', '09171234568', '2 Test St', 'Pasig', 'Metro Manila');
-- 10% commission on this category from yesterday, to see commission reversed.
insert into public.commission_schedules (category_id, rate_bps, starts_at, note)
values ((select id from public.categories where slug = 'mailers'), 1000, now() - interval '1 day', 'test');

create function pg_temp.as_user(p_id text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated', 'aal', 'aal1')::text, true);
$$;
create function pg_temp.last_order() returns uuid language sql as $$ select id from public.orders order by ref desc limit 1 $$;
create function pg_temp.cart(p_product text) returns void language sql as $$
  delete from public.cart_items; insert into public.cart_items (product_id, quantity) values (p_product::uuid, 1);
$$;
create function pg_temp.payable() returns bigint language sql as $$
  select coalesce(sum(credit_centavos - debit_centavos), 0)::bigint from public.ledger_entries
  where account = 'supplier_payable' and supplier_id = 'f6000000-0000-4000-8000-000000000001'
$$;
grant execute on all functions in schema pg_temp to authenticated, service_role;
create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated, service_role;
set local role authenticated;

-- ------------------------------------------------------------ addresses and shipping fee
select pg_temp.as_user('f5000000-0000-4000-8000-000000000001');
select is((select count(*)::int from public.addresses), 1, 'buyers see only their own addresses');
select pg_temp.cart('f7000000-0000-4000-8000-000000000001');
select throws_ok($$ select * from public.start_checkout(gen_random_uuid(), 'ewallet', null) $$, '22023', null, 'courier orders need an address');
select throws_ok($$ select * from public.start_checkout(gen_random_uuid(), 'ewallet', 'f8000000-0000-4000-8000-000000000002') $$,
  'P0002', null, 'cannot ship to someone else''s address');
select throws_ok($$ select * from public.start_checkout(gen_random_uuid(), 'ewallet', 'f8000000-0000-4000-8000-000000000001', 'cod') $$,
  '22023', null, 'COD is off until admin sets a limit');
select is((select amount_centavos from public.start_checkout(gen_random_uuid(), 'ewallet', 'f8000000-0000-4000-8000-000000000001')),
  25000::bigint, 'online: 100.00 item + 150.00 courier fee');
select is((select ship_to ->> 'city' from public.orders where id = pg_temp.last_order()), 'Pasig', 'address frozen on the order');

-- ------------------------------------------------------------ COD, stock item: nothing due online
reset role;
update public.platform_settings set value = '1000000' where key = 'cod_max_order_centavos';
set local role authenticated;
select is((select amount_centavos from public.start_checkout(gen_random_uuid(), 'ewallet', 'f8000000-0000-4000-8000-000000000001', 'cod')),
  0::bigint, 'COD on a stock item: nothing to pay online');
select is((select status::text from public.orders where id = pg_temp.last_order()), 'confirmed', 'COD order confirmed at once');
select is((select count(*)::int from public.payments p join public.orders o on o.checkout_id = p.checkout_id where o.id = pg_temp.last_order()),
  0, 'no gateway payment for it');
reset role;
select is(pg_temp.payable(), -1000::bigint, '10% commission on the items is owed by the supplier');
set local role authenticated;
select lives_ok($$ select public.cancel_order(pg_temp.last_order()) $$, 'buyer cancels the COD order before production');
reset role;
select is(pg_temp.payable(), 0::bigint, 'commission reversed on cancellation');
set local role authenticated;

-- ------------------------------------------------------------ COD, custom item: downpayment first
select pg_temp.cart('f7000000-0000-4000-8000-000000000002');
select is((select amount_centavos from public.start_checkout(gen_random_uuid(), 'ewallet', 'f8000000-0000-4000-8000-000000000001', 'cod')),
  17500::bigint, 'custom COD: 50% of (200.00 + 150.00) online first');
insert into ids select 'custom', pg_temp.last_order();
select public.attach_payment_session((select checkout_id from public.orders where id = (select v from ids where k = 'custom')), 'fake', 'ref-d1');
reset role;
set local role service_role;
select is(public.confirm_payment('fake', 'evt-d1', 'ref-d1', 17500, null, '{}'), 'paid', 'downpayment confirmed');
reset role;
select is((select status::text || ':' || paid_online_centavos from public.orders where id = (select v from ids where k = 'custom')),
  'confirmed:17500', 'COD order confirmed with the downpayment recorded');

-- ------------------------------------------------------------ proofs and production
set local role authenticated;
select pg_temp.as_user('f5000000-0000-4000-8000-000000000002');
select throws_ok($$ select public.start_production((select v from ids where k = 'custom')) $$, '22023', null, 'no production before an approved proof');
select lives_ok($$ select public.send_proof((select v from ids where k = 'custom'), (select v from ids where k = 'custom') || '/proofs/v1.pdf', 'First draft') $$,
  'supplier sends a proof');
select throws_ok($$ select public.send_proof((select v from ids where k = 'custom'), (select v from ids where k = 'custom') || '/proofs/v1b.pdf') $$,
  '22023', null, 'one open proof at a time');
select pg_temp.as_user('f5000000-0000-4000-8000-000000000001');
select lives_ok($$ select public.add_artwork((select v from ids where k = 'custom'), (select v from ids where k = 'custom') || '/artwork/logo.png', 'logo.png') $$,
  'buyer adds artwork');
select throws_ok($$ select public.respond_proof((select id from public.proofs where version = 1), false, '') $$, '22023', null, 'changes need a note');
select lives_ok($$ select public.respond_proof((select id from public.proofs where version = 1), false, 'Logo bigger please') $$, 'buyer asks for changes');
select pg_temp.as_user('f5000000-0000-4000-8000-000000000002');
select lives_ok($$ select public.send_proof((select v from ids where k = 'custom'), (select v from ids where k = 'custom') || '/proofs/v2.pdf') $$, 'proof v2');
select pg_temp.as_user('f5000000-0000-4000-8000-000000000001');
select lives_ok($$ select public.respond_proof((select id from public.proofs where version = 2), true) $$, 'buyer approves v2');
select throws_ok($$ select public.cancel_order((select v from ids where k = 'custom')) $$, '22023', null, 'cancellation ends once the proof is approved');
reset role;
select throws_ok($$ update public.proofs set note = 'x' where version = 2 $$, '42501', null, 'approved proof is frozen as evidence');
set local role authenticated;
select pg_temp.as_user('f5000000-0000-4000-8000-000000000002');
select lives_ok($$ select public.start_production((select v from ids where k = 'custom')) $$, 'production starts after approval');

-- ------------------------------------------------------------ courier tracking
select lives_ok($$ select public.record_shipment((select v from ids where k = 'custom'), 'fake', 'FAKE-1') $$, 'shipment booked');
select is((select cod_amount_centavos from public.shipments where tracking_ref = 'FAKE-1'), 17500::bigint, 'courier collects the COD balance');
select throws_ok($$ select public.mark_shipped((select v from ids where k = 'custom')) $$, '22023', null, 'courier orders move by tracking only');
reset role;
set local role service_role;
select is(public.record_tracking_event('fake', 'trk-1', 'FAKE-1', 'picked_up', now(), '', null, '{}'), 'recorded', 'pickup recorded');
select is(public.record_tracking_event('fake', 'trk-1', 'FAKE-1', 'picked_up', now(), '', null, '{}'), 'duplicate', 'same event twice changes nothing');
select is(public.record_tracking_event('fake', 'trk-2', 'FAKE-1', 'delivered', now(), '', 17500, '{}'), 'recorded', 'delivery recorded');
reset role;
select is((select status::text from public.orders where id = (select v from ids where k = 'custom')), 'delivered', 'order delivered');
select ok((select delivered_at is not null from public.orders where id = (select v from ids where k = 'custom')), 'delivery date starts the payout clock');
select is((select amount_centavos from public.cod_remittances), 17500::bigint, 'COD remittance recorded');

-- ------------------------------------------------------------ refused COD delivery
set local role authenticated;
select pg_temp.as_user('f5000000-0000-4000-8000-000000000001');
select pg_temp.cart('f7000000-0000-4000-8000-000000000001');
select public.start_checkout(gen_random_uuid(), 'ewallet', 'f8000000-0000-4000-8000-000000000001', 'cod');
insert into ids select 'refused', pg_temp.last_order();
select pg_temp.as_user('f5000000-0000-4000-8000-000000000002');
select public.record_shipment((select v from ids where k = 'refused'), 'fake', 'FAKE-2');
reset role;
set local role service_role;
select is(public.record_tracking_event('fake', 'trk-3', 'FAKE-2', 'returned', now(), 'Refused by buyer', null, '{}'), 'recorded', 'return recorded');
reset role;
select is((select status::text || ':' || (refused_at is not null) from public.orders where id = (select v from ids where k = 'refused')),
  'cancelled:true', 'refused COD order cancelled and counted');
update public.platform_settings set value = '1' where key = 'cod_max_refusals';
set local role authenticated;
select pg_temp.as_user('f5000000-0000-4000-8000-000000000001');
select pg_temp.cart('f7000000-0000-4000-8000-000000000001');
reset role;
set local role authenticated;
select pg_temp.as_user('f5000000-0000-4000-8000-000000000001');
select throws_ok($$ select * from public.start_checkout(gen_random_uuid(), 'ewallet', 'f8000000-0000-4000-8000-000000000001', 'cod') $$,
  '22023', null, 'too many refusals: COD no longer offered');

-- ------------------------------------------------------------ non-courier delivery (own delivery)
select pg_temp.cart('f7000000-0000-4000-8000-000000000001');
select public.start_checkout(gen_random_uuid(), 'ewallet', 'f8000000-0000-4000-8000-000000000001');
insert into ids select 'own', pg_temp.last_order();
select public.attach_payment_session((select checkout_id from public.orders where id = (select v from ids where k = 'own')), 'fake', 'ref-d2');
reset role;
set local role service_role;
select public.confirm_payment('fake', 'evt-d2', 'ref-d2', 25000, null, '{}');
reset role;
update public.orders set fulfilment_mode = 'supplier_delivery' where id = (select v from ids where k = 'own');
set local role authenticated;
select pg_temp.as_user('f5000000-0000-4000-8000-000000000002');
select lives_ok($$ select public.mark_shipped((select v from ids where k = 'own')) $$, 'supplier delivers it themselves');
select lives_ok($$ select public.mark_delivered((select v from ids where k = 'own')) $$, 'supplier says delivered');
reset role;
update public.orders set delivery_claimed_at = now() - interval '4 days' where id = (select v from ids where k = 'own');
select is(private.auto_confirm_deliveries(), 1, 'unanswered delivery confirmed automatically after 3 days');

select ok((select coalesce(bool_and(d = c), true) from (select txn_id, sum(debit_centavos) d, sum(credit_centavos) c
  from public.ledger_entries group by txn_id) t), 'every ledger transaction balances');

select * from finish();
rollback;
