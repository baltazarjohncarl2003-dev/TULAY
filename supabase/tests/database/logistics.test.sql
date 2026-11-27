-- Logistics before the permit: manual courier shipments (supplier-entered tracking, buyer confirms,
-- support records returns) and per-supplier shipping fees by zone.
begin;
create extension if not exists pgtap with schema extensions;
select plan(44);

update public.suppliers set status = 'suspended'; -- hide seed suppliers; rolled back at the end

insert into auth.users (id, email, raw_user_meta_data) values
  ('a9000000-0000-4000-8000-000000000001', 'gb@test.ph', '{"role":"buyer"}'),
  ('a9000000-0000-4000-8000-000000000002', 'gs@test.ph', '{"role":"supplier"}'),
  ('a9000000-0000-4000-8000-000000000003', 'gs2@test.ph', '{"role":"supplier"}'),
  ('a9000000-0000-4000-8000-000000000004', 'ga@test.ph', '{"role":"buyer"}');
update public.profiles set role = 'admin' where id = 'a9000000-0000-4000-8000-000000000004';
insert into public.admin_roles (user_id, sub_role) values ('a9000000-0000-4000-8000-000000000004', 'support');
insert into public.suppliers (id, owner_id, business_name, legal_name, category_id, city, province, moq, lead_days, description, status)
select v.id, v.owner, v.name, v.name, (select id from public.categories where slug = 'mailers'), 'Pasig', 'Metro Manila', 1, 7, 'x', 'verified'
from (values
  ('aa000000-0000-4000-8000-000000000001'::uuid, 'a9000000-0000-4000-8000-000000000002'::uuid, 'Ship Co'),
  ('aa000000-0000-4000-8000-000000000002'::uuid, 'a9000000-0000-4000-8000-000000000003'::uuid, 'Other Co')
) as v (id, owner, name);
insert into public.products (id, supplier_id, category_id, title, description, moq, unit, indicative_price_centavos, return_class, status, idempotency_key)
values ('ab000000-0000-4000-8000-000000000001', 'aa000000-0000-4000-8000-000000000001', (select id from public.categories where slug = 'mailers'),
  'Stock box', 'x', 1, 'pcs', 10000, 'standard', 'approved', gen_random_uuid());
insert into public.addresses (id, user_id, recipient, phone, line1, city, province) values
  ('ac000000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000001', 'Buyer', '09171234567', '1 St', 'Cebu City', ' cebu '),
  ('ac000000-0000-4000-8000-000000000002', 'a9000000-0000-4000-8000-000000000001', 'Buyer', '09171234567', '2 St', 'Pasig', 'NCR'),
  ('ac000000-0000-4000-8000-000000000003', 'a9000000-0000-4000-8000-000000000001', 'Buyer', '09171234567', '3 St', 'Somewhere', 'Atlantis');

create function pg_temp.as_user(p_id text, p_aal text default 'aal1') returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated', 'aal', p_aal)::text, true);
$$;
create function pg_temp.last_order() returns uuid language sql as $$ select id from public.orders order by ref desc limit 1 $$;
-- Buyer checks out one stock box to an address; online orders are paid at once. Returns the order id.
create function pg_temp.buy(p_address text, p_option text, p_ref text) returns uuid language plpgsql as $$
declare co uuid; due bigint;
begin
  delete from public.cart_items;
  insert into public.cart_items (product_id, quantity) values ('ab000000-0000-4000-8000-000000000001', 1);
  select checkout_id, amount_centavos into co, due
  from public.start_checkout(gen_random_uuid(), 'ewallet', p_address::uuid, p_option::public.payment_option);
  if due > 0 then
    perform public.attach_payment_session(co, 'fake', p_ref);
    perform set_config('role', 'service_role', true);
    perform public.confirm_payment('fake', 'evt-' || p_ref, p_ref, due, null, '{}');
    perform set_config('role', 'authenticated', true);
  end if;
  return pg_temp.last_order();
end $$;
grant execute on all functions in schema pg_temp to authenticated, service_role;
create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated, service_role;
set local role authenticated;

-- ------------------------------------------------------------ zone fees
select pg_temp.as_user('a9000000-0000-4000-8000-000000000002');
select lives_ok($$ select public.set_shipping_rates(8000, null, 20000, 25000) $$, 'supplier sets zone fees');
select is((select count(*)::int from public.supplier_shipping_rates), 3, 'a null zone keeps the platform fee');
select throws_ok($$ select public.set_shipping_rates(-1, null, null, null) $$, '23514', null, 'negative fee rejected');
select throws_ok($$ insert into public.supplier_shipping_rates (supplier_id, zone, fee_centavos)
  values ('aa000000-0000-4000-8000-000000000001', 'luzon', 1) $$, '42501', null, 'no direct writes to rates');
select pg_temp.as_user('a9000000-0000-4000-8000-000000000001');
select throws_ok($$ select public.set_shipping_rates(1, 1, 1, 1) $$, '42501', null, 'a buyer cannot set fees');

delete from public.cart_items;
insert into public.cart_items (product_id, quantity) values ('ab000000-0000-4000-8000-000000000001', 1);
select is((select fee_centavos from public.cart_shipping_fees() where address_id = 'ac000000-0000-4000-8000-000000000001'),
  20000::bigint, 'cart shows the Visayas fee for a Cebu address (case and spaces ignored)');
select is((select fee_centavos from public.cart_shipping_fees() where address_id = 'ac000000-0000-4000-8000-000000000002'),
  8000::bigint, 'NCR alias = Metro Manila fee');
select is((select fee_centavos from public.cart_shipping_fees() where address_id = 'ac000000-0000-4000-8000-000000000003'),
  15000::bigint, 'unknown province = platform flat fee');

insert into ids select 'cebu', pg_temp.buy('ac000000-0000-4000-8000-000000000001', 'online', 'g1');
select is((select shipping_centavos || ':' || total_centavos from public.orders where id = (select v from ids where k = 'cebu')),
  '20000:30000', 'checkout charges the supplier''s zone fee');
select is((select status::text from public.orders where id = (select v from ids where k = 'cebu')), 'paid', 'order paid');
select pg_temp.as_user('a9000000-0000-4000-8000-000000000002');
select public.set_shipping_rates(8000, null, 99000, 25000);
select is((select shipping_centavos from public.orders where id = (select v from ids where k = 'cebu')), 20000::bigint,
  'a later rate change does not touch the order');
select pg_temp.as_user('a9000000-0000-4000-8000-000000000001');
insert into ids select 'unknown', pg_temp.buy('ac000000-0000-4000-8000-000000000003', 'online', 'g2');
select is((select shipping_centavos from public.orders where id = (select v from ids where k = 'unknown')), 15000::bigint,
  'checkout falls back to the flat fee');

-- ------------------------------------------------------------ manual shipment
select pg_temp.as_user('a9000000-0000-4000-8000-000000000003');
select throws_ok($$ select public.record_manual_shipment((select v from ids where k = 'cebu'), 'lbc', '', 'LBC1') $$,
  'P0002', null, 'another supplier cannot ship it');
select pg_temp.as_user('a9000000-0000-4000-8000-000000000002');
select throws_ok($$ select public.record_manual_shipment((select v from ids where k = 'cebu'), 'fake', '', 'X1') $$,
  '22023', null, 'the test courier is not a manual courier');
select throws_ok($$ select public.record_manual_shipment((select v from ids where k = 'cebu'), 'other', ' ', 'X1') $$,
  '23514', null, '"Other" needs a courier name');
select throws_ok($$ select public.report_shipment_update((select v from ids where k = 'cebu'), 'in_transit') $$,
  '22023', null, 'no updates before tracking is entered');
select lives_ok($$ select public.record_manual_shipment((select v from ids where k = 'cebu'), 'lbc', '', ' LBC123 ') $$,
  'supplier enters courier and tracking');
select is((select carrier || ':' || tracking_ref || ':' || status || ':' || manual from public.shipments where order_id = (select v from ids where k = 'cebu')),
  'lbc:LBC123:picked_up:true', 'shipment recorded as picked up');
select is((select status::text from public.orders where id = (select v from ids where k = 'cebu')), 'shipped', 'order on the way');
select throws_ok($$ select public.record_manual_shipment((select v from ids where k = 'cebu'), 'jnt', '', 'J1') $$,
  '22023', null, 'tracking is entered once');
select throws_ok($$ select public.report_shipment_update((select v from ids where k = 'cebu'), 'returned') $$,
  '22023', null, 'supplier cannot report a return');
select throws_ok($$ select public.report_shipment_update((select v from ids where k = 'cebu'), 'delivered') $$,
  '22023', null, 'supplier cannot report delivered directly');
select lives_ok($$ select public.report_shipment_update((select v from ids where k = 'cebu'), 'failed_attempt', 'Nobody home') $$,
  'supplier reports a failed attempt');
select is((select status::text from public.shipments where order_id = (select v from ids where k = 'cebu')), 'failed_attempt', 'shipment shows it');
select pg_temp.as_user('a9000000-0000-4000-8000-000000000001');
select ok(exists (select 1 from public.notifications where title = 'Delivery attempt failed'), 'buyer told about the failed attempt');
select throws_ok($$ select public.report_shipment_update((select v from ids where k = 'cebu'), 'in_transit') $$,
  'P0002', null, 'buyer cannot post tracking');
select pg_temp.as_user('a9000000-0000-4000-8000-000000000002');
select lives_ok($$ select public.mark_delivered((select v from ids where k = 'cebu')) $$, 'supplier marks delivered');
select pg_temp.as_user('a9000000-0000-4000-8000-000000000001');
select lives_ok($$ select public.confirm_delivery((select v from ids where k = 'cebu')) $$, 'buyer confirms');
select is((select o.status || ':' || s.status from public.orders o join public.shipments s on s.order_id = o.id where o.id = (select v from ids where k = 'cebu')),
  'delivered:delivered', 'order and shipment delivered');
select is((select count(*)::int from public.tracking_events e join public.shipments s on s.id = e.shipment_id
  where s.order_id = (select v from ids where k = 'cebu')), 3, 'timeline: picked up, failed attempt, delivered');
select is((select count(*)::int from public.cod_remittances), 0, 'no COD remittance on an online order');

-- ------------------------------------------------------------ manual COD, auto-confirmed
reset role;
update public.platform_settings set value = '1000000' where key = 'cod_max_order_centavos';
set local role authenticated;
select pg_temp.as_user('a9000000-0000-4000-8000-000000000001');
insert into ids select 'cod', pg_temp.buy('ac000000-0000-4000-8000-000000000002', 'cod', 'g3');
select pg_temp.as_user('a9000000-0000-4000-8000-000000000002');
select public.record_manual_shipment((select v from ids where k = 'cod'), 'other', 'Juan Courier', 'JC-9');
select is((select carrier_name || ':' || cod_amount_centavos from public.shipments where order_id = (select v from ids where k = 'cod')),
  'Juan Courier:18000', 'COD to collect = item + Metro Manila fee');
select public.mark_delivered((select v from ids where k = 'cod'));
reset role;
select is((select count(*)::int from public.ledger_entries where account = 'courier_payable' and order_id = (select v from ids where k = 'cod')), 0,
  'a manual shipment leaves the shipping fee with the supplier');
update public.orders set delivery_claimed_at = now() - interval '10 days' where id = (select v from ids where k = 'cod');
select ok(private.auto_confirm_deliveries() >= 1, 'manual courier order auto-confirms');
select is((select amount_centavos from public.cod_remittances where order_id = (select v from ids where k = 'cod')), 18000::bigint,
  'COD remittance recorded on delivery');

-- ------------------------------------------------------------ support records a returned parcel
set local role authenticated;
select pg_temp.as_user('a9000000-0000-4000-8000-000000000001');
insert into ids select 'ret', pg_temp.buy('ac000000-0000-4000-8000-000000000001', 'online', 'g4');
select pg_temp.as_user('a9000000-0000-4000-8000-000000000002');
select public.record_manual_shipment((select v from ids where k = 'ret'), 'jnt', '', 'JT-77');
select throws_ok($$ select public.admin_record_parcel_returned((select v from ids where k = 'ret'), 'Refused') $$,
  '42501', null, 'supplier cannot record a return');
select pg_temp.as_user('a9000000-0000-4000-8000-000000000004', 'aal2');
select throws_ok($$ select public.admin_record_parcel_returned((select v from ids where k = 'ret'), '') $$,
  '22023', null, 'return needs a reason');
select ok(public.admin_record_parcel_returned((select v from ids where k = 'ret'), 'Refused at the door') like 'refund:%',
  'support records the return; a refund is created');
reset role;
select is((select status::text from public.orders where id = (select v from ids where k = 'ret')), 'cancelled', 'order cancelled');
select is((select amount_centavos from public.refunds where order_id = (select v from ids where k = 'ret')), 99000::bigint + 10000,
  'buyer refunded what was paid online');

-- ------------------------------------------------------------ webhook-tracked shipments unchanged
set local role service_role;
select public.record_shipment((select v from ids where k = 'unknown'), 'fake', 'FAKE-G1');
select public.record_tracking_event('fake', 'trk-g1', 'FAKE-G1', 'picked_up', now(), '', null, '{}');
reset role;
set local role authenticated;
select pg_temp.as_user('a9000000-0000-4000-8000-000000000002');
select throws_ok($$ select public.mark_delivered((select v from ids where k = 'unknown')) $$,
  '22023', null, 'courier-tracked orders still cannot be marked delivered by hand');
select pg_temp.as_user('a9000000-0000-4000-8000-000000000001');
select throws_ok($$ select public.report_shipment_update((select v from ids where k = 'unknown'), 'in_transit') $$,
  'P0002', null, 'buyer cannot post tracking on a webhook shipment');
select pg_temp.as_user('a9000000-0000-4000-8000-000000000002');
select throws_ok($$ select public.report_shipment_update((select v from ids where k = 'unknown'), 'in_transit') $$,
  '22023', null, 'supplier cannot post tracking on a webhook shipment');

-- ------------------------------------------------------------ provinces
select is((select zone::text from public.ph_provinces where name = 'Davao del Sur'), 'mindanao', 'province list has zones');

select * from finish();
rollback;
