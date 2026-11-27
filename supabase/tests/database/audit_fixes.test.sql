-- Audit fixes (2026-11-15): mismatched payments release stock, a checkout with an open payment is not
-- cancelled, the custom-order cancellation window, late tracking events, and returned parcels.
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

update public.suppliers set status = 'suspended'; -- hide seed data

insert into auth.users (id, email, raw_user_meta_data) values
  ('fa000000-0000-4000-8000-000000000001', 'ab@test.ph', '{"role":"buyer"}'),
  ('fa000000-0000-4000-8000-000000000002', 'as@test.ph', '{"role":"supplier"}');
insert into public.suppliers (id, owner_id, business_name, legal_name, category_id, city, province, moq, lead_days, description, status)
values ('fb000000-0000-4000-8000-000000000001', 'fa000000-0000-4000-8000-000000000002', 'Audit Co', 'Audit Co',
  (select id from public.categories where slug = 'mailers'), 'Pasig', 'Metro Manila', 1, 7, 'x', 'verified');
insert into public.products (id, supplier_id, category_id, title, description, moq, unit, indicative_price_centavos, return_class, status, stock, idempotency_key)
select v.id, 'fb000000-0000-4000-8000-000000000001', (select id from public.categories where slug = 'mailers'), v.title, 'x', 1, 'pcs',
  v.price, v.rc::public.return_class, 'approved', v.stock, gen_random_uuid()
from (values
  ('fc000000-0000-4000-8000-000000000001'::uuid, 'Stock box', 10000::bigint, 'standard', 5),
  ('fc000000-0000-4000-8000-000000000002'::uuid, 'Printed box', 20000::bigint, 'custom', null)
) as v (id, title, price, rc, stock);
insert into public.addresses (id, user_id, recipient, phone, line1, city, province) values
  ('fd000000-0000-4000-8000-000000000001', 'fa000000-0000-4000-8000-000000000001', 'Buyer', '09171234567', '1 Test St', 'Pasig', 'Metro Manila');

create function pg_temp.as_user(p_id text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated', 'aal', 'aal1')::text, true);
$$;
create function pg_temp.last_order() returns uuid language sql as $$ select id from public.orders order by ref desc limit 1 $$;
create function pg_temp.cart(p_product text) returns void language sql as $$
  delete from public.cart_items; insert into public.cart_items (product_id, quantity) values (p_product::uuid, 1);
$$;
create function pg_temp.checkout(p_ref text) returns uuid language plpgsql as $$
declare co uuid;
begin
  select checkout_id into co from public.start_checkout(gen_random_uuid(), 'ewallet', 'fd000000-0000-4000-8000-000000000001');
  perform public.attach_payment_session(co, 'fake', p_ref);
  return co;
end $$;
create function pg_temp.stock() returns int language sql as $$ select stock from public.products where id = 'fc000000-0000-4000-8000-000000000001' $$;
grant execute on all functions in schema pg_temp to authenticated, service_role;
create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated, service_role;

-- ------------------------------------------------------------ 1. mismatched payment releases the checkout
set local role authenticated;
select pg_temp.as_user('fa000000-0000-4000-8000-000000000001');
select pg_temp.cart('fc000000-0000-4000-8000-000000000001');
insert into ids select 'co1', pg_temp.checkout('ref-a1');
select is(pg_temp.stock(), 4, 'checkout reserves one unit');

-- 2. a second checkout does not cancel one whose payment page is open
select pg_temp.cart('fc000000-0000-4000-8000-000000000001');
select throws_ok($$ select * from public.start_checkout(gen_random_uuid(), 'ewallet', 'fd000000-0000-4000-8000-000000000001') $$,
  '22023', null, 'a payment in progress blocks a new checkout');

reset role;
set local role service_role;
select is(public.confirm_payment('fake', 'evt-a1', 'ref-a1', 999, null, '{}'), 'needs_review', 'wrong amount parked for review');
reset role;
select is(pg_temp.stock(), 5, 'reserved stock is back on sale');
select is((select status::text from public.checkouts where id = (select v from ids where k = 'co1')), 'cancelled', 'checkout closed');
select is((select status::text from public.orders where checkout_id = (select v from ids where k = 'co1')), 'cancelled', 'its order cancelled');
select is((select status::text from public.payments where checkout_id = (select v from ids where k = 'co1')), 'needs_review', 'payment awaits a finance refund');

-- ------------------------------------------------------------ 3. custom-order cancellation window
set local role authenticated;
select pg_temp.as_user('fa000000-0000-4000-8000-000000000001');
select pg_temp.cart('fc000000-0000-4000-8000-000000000002');
insert into ids select 'co2', pg_temp.checkout('ref-a2');
reset role;
set local role service_role;
select is(public.confirm_payment('fake', 'evt-a2', 'ref-a2', 35000, null, '{}'), 'paid', 'custom order paid');
reset role;
update public.orders set paid_at = now() - interval '25 hours' where checkout_id = (select v from ids where k = 'co2');
set local role authenticated;
select pg_temp.as_user('fa000000-0000-4000-8000-000000000001');
select throws_ok($$ select public.cancel_order((select id from public.orders where checkout_id = (select v from ids where k = 'co2'))) $$,
  '22023', null, 'custom order past the 24-hour window cannot be cancelled');

-- ------------------------------------------------------------ 4. late tracking event, 5. returned parcel
select pg_temp.cart('fc000000-0000-4000-8000-000000000001');
insert into ids select 'co3', pg_temp.checkout('ref-a3');
reset role;
set local role service_role;
select is(public.confirm_payment('fake', 'evt-a3', 'ref-a3', 25000, null, '{}'), 'paid', 'stock order paid');
reset role;
insert into ids select 'o3', id from public.orders where checkout_id = (select v from ids where k = 'co3');
set local role authenticated;
select pg_temp.as_user('fa000000-0000-4000-8000-000000000002');
select throws_ok($$ select public.record_shipment((select v from ids where k = 'o3'), 'fake', 'FAKE-A3') $$,
  '42501', null, 'a supplier cannot record a courier booking itself');
reset role;
set local role service_role;
select lives_ok($$ select public.record_shipment((select v from ids where k = 'o3'), 'fake', 'FAKE-A3') $$, 'shipment booked');
select is(public.record_tracking_event('fake', 'ta-1', 'FAKE-A3', 'out_for_delivery', now(), '', null, '{}'), 'recorded', 'out for delivery');
select is(public.record_tracking_event('fake', 'ta-2', 'FAKE-A3', 'picked_up', now() - interval '1 day', '', null, '{}'), 'recorded', 'late pickup event');
reset role;
select is((select status::text from public.shipments where tracking_ref = 'FAKE-A3'), 'out_for_delivery', 'late event does not move the status back');
select is(pg_temp.stock(), 4, 'stock sold');
set local role service_role;
select ok(public.record_tracking_event('fake', 'ta-3', 'FAKE-A3', 'returned', now(), 'Address not found', null, '{}') like 'refund:%',
  'returned parcel creates a refund');
reset role;
select is((select amount_centavos || ':' || status from public.refunds where order_id = (select v from ids where k = 'o3')),
  '25000:pending', 'full online payment to refund');
select is(pg_temp.stock(), 5, 'returned stock is back on sale');

select * from finish();
rollback;
