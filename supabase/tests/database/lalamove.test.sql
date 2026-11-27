-- Lalamove: live delivery quotes at checkout, top-up or book at booking, refund of the excess, voiding a booking
-- the courier ended, coordinates and the supplier's vehicle.
begin;
create extension if not exists pgtap with schema extensions;
select plan(144);

update public.suppliers set status = 'suspended'; -- hide seed suppliers; rolled back at the end

insert into auth.users (id, email, raw_user_meta_data) values
  ('e6000000-0000-4000-8000-000000000001', 'lb@test.ph', '{"role":"buyer"}'),
  ('e6000000-0000-4000-8000-000000000002', 'ls1@test.ph', '{"role":"supplier"}'),
  ('e6000000-0000-4000-8000-000000000003', 'ls2@test.ph', '{"role":"supplier"}'),
  ('e6000000-0000-4000-8000-000000000004', 'lb2@test.ph', '{"role":"buyer"}'),
  ('e6000000-0000-4000-8000-000000000005', 'la@test.ph', '{"role":"buyer"}');
update public.profiles set role = 'admin' where id = 'e6000000-0000-4000-8000-000000000005';
insert into public.admin_roles (user_id, sub_role) values ('e6000000-0000-4000-8000-000000000005', 'support');
insert into public.admin_roles (user_id, sub_role) values ('e6000000-0000-4000-8000-000000000005', 'finance');
insert into public.suppliers (id, owner_id, business_name, legal_name, category_id, city, province, moq, lead_days, description, status)
select v.id, v.owner, v.name, v.name, (select id from public.categories where slug = 'mailers'), 'Pasig', 'Metro Manila', 1, 7, 'x', 'verified'
from (values
  ('e7000000-0000-4000-8000-000000000001'::uuid, 'e6000000-0000-4000-8000-000000000002'::uuid, 'Lala Co'),
  ('e7000000-0000-4000-8000-000000000002'::uuid, 'e6000000-0000-4000-8000-000000000003'::uuid, 'Move Co')
) as v (id, owner, name);
insert into public.products (id, supplier_id, category_id, title, description, moq, unit, indicative_price_centavos, return_class, status, idempotency_key)
select v.id, v.sup, (select id from public.categories where slug = 'mailers'), v.title, 'x', 1, 'pcs', v.price, 'standard', 'approved', gen_random_uuid()
from (values
  ('e8000000-0000-4000-8000-000000000001'::uuid, 'e7000000-0000-4000-8000-000000000001'::uuid, 'Box A', 10000::bigint),
  ('e8000000-0000-4000-8000-000000000002'::uuid, 'e7000000-0000-4000-8000-000000000002'::uuid, 'Box B', 20000::bigint)
) as v (id, sup, title, price);
insert into public.addresses (id, user_id, recipient, phone, line1, city, province, lat, lng) values
  ('e9000000-0000-4000-8000-000000000001', 'e6000000-0000-4000-8000-000000000001', 'Buyer', '09171234567', '1 St', 'Makati', 'Metro Manila', 14.5547, 121.0244),
  ('e9000000-0000-4000-8000-000000000002', 'e6000000-0000-4000-8000-000000000001', 'Buyer', '09171234567', '2 St', 'Pasig', 'Metro Manila', null, null),
  ('e9000000-0000-4000-8000-000000000003', 'e6000000-0000-4000-8000-000000000004', 'Other', '09171234568', '3 St', 'Pasig', 'Metro Manila', null, null);
-- 10% commission on the category from yesterday, so a normal refund would give commission back.
insert into public.commission_schedules (category_id, rate_bps, starts_at, note)
values ((select id from public.categories where slug = 'mailers'), 1000, now() - interval '1 day', 'test');

create function pg_temp.as_user(p_id text, p_aal text default 'aal1') returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated', 'aal', p_aal)::text, true);
$$;
create function pg_temp.buyer() returns text language sql as $$ select 'e6000000-0000-4000-8000-000000000001'::text $$;
create function pg_temp.last_order() returns uuid language sql as $$ select id from public.orders order by ref desc limit 1 $$;
-- Runs a query as the table owner and returns its first value as text (reads that RLS would hide).
create function pg_temp.val(p_sql text) returns text language plpgsql security definer as $$
declare r text;
begin execute p_sql into r; return r; end $$;
create function pg_temp.run(p_sql text) returns void language plpgsql security definer as $$
begin execute p_sql; end $$;
-- Service role stores a live quote (like the server does). Leaves the role as it found it.
create function pg_temp.sq(p_buyer text, p_sup text, p_addr text, p_amt bigint) returns uuid language plpgsql as $$
declare q uuid; prev text := current_setting('role');
begin
  perform set_config('role', 'service_role', true);
  select s.id into q from public.save_courier_quote(p_buyer::uuid, p_sup::uuid, p_addr::uuid, 'fake', 'MOTORCYCLE', p_amt) s;
  perform set_config('role', prev, true);
  return q;
end $$;
-- Buyer checks out one product to an address with the given quotes and pays online at once. Returns the order id.
create function pg_temp.buy(p_product text, p_address text, p_quotes uuid[]) returns uuid language plpgsql as $$
declare co uuid; due bigint; ref text := 'r' || gen_random_uuid();
begin
  perform set_config('role', 'authenticated', true);
  perform pg_temp.as_user(pg_temp.buyer());
  delete from public.cart_items;
  insert into public.cart_items (product_id, quantity) values (p_product::uuid, 1);
  select s.checkout_id, s.amount_centavos into co, due
  from public.start_checkout(gen_random_uuid(), 'qrph', p_address::uuid, 'online', p_quotes) s;
  perform public.attach_payment_session(co, 'fake', ref);
  perform set_config('role', 'service_role', true);
  perform public.confirm_payment('fake', 'evt-' || ref, ref, due, null, '{}');
  perform set_config('role', 'authenticated', true);
  return pg_temp.last_order();
end $$;
-- A box from Lala Co shipped to the Makati address with a fresh live quote of p_amt.
create function pg_temp.buyq(p_amt bigint) returns uuid language sql as $$
  select pg_temp.buy('e8000000-0000-4000-8000-000000000001', 'e9000000-0000-4000-8000-000000000001',
    array[pg_temp.sq(pg_temp.buyer(), 'e7000000-0000-4000-8000-000000000001', 'e9000000-0000-4000-8000-000000000001', p_amt)]);
$$;
create function pg_temp.cart(p_product text) returns void language sql as $$
  delete from public.cart_items; insert into public.cart_items (product_id, quantity) values (p_product::uuid, 1);
$$;
create function pg_temp.cp(p_order uuid) returns text language sql as $$
  select pg_temp.val('select coalesce(sum(credit_centavos - debit_centavos), 0) from public.ledger_entries where account = ''courier_payable'' and order_id = '''
    || p_order || '''');
$$;
create function pg_temp.o(p_order uuid, p_expr text) returns text language sql as $$
  select pg_temp.val('select ' || p_expr || ' from public.orders where id = ''' || p_order || '''');
$$;
create function pg_temp.sid(p_ref text) returns uuid language sql as $$ select pg_temp.val('select id from public.shipments where tracking_ref = ''' || p_ref || '''')::uuid $$;
create function pg_temp.notified(p_user text, p_title text) returns boolean language sql as $$
  select pg_temp.val('select count(*) from public.notifications where user_id = ''' || p_user || ''' and title = ''' || p_title || '''')::int > 0 $$;
create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated, service_role;
grant execute on all functions in schema pg_temp to authenticated, service_role;

-- ------------------------------------------------------------ save_courier_quote
set local role service_role;
select lives_ok($$ select * from public.save_courier_quote('e6000000-0000-4000-8000-000000000001', 'e7000000-0000-4000-8000-000000000001',
  'e9000000-0000-4000-8000-000000000001', 'lalamove', 'MOTORCYCLE', 9000) $$, 'service role saves a quote');
select throws_ok($$ select * from public.save_courier_quote('e6000000-0000-4000-8000-000000000001', 'e7000000-0000-4000-8000-000000000001',
  'e9000000-0000-4000-8000-000000000003', 'lalamove', 'MOTORCYCLE', 9000) $$, 'P0002', null, 'a quote for someone else''s address is rejected');
select throws_ok($$ select * from public.save_courier_quote('e6000000-0000-4000-8000-000000000001', pg_temp.val('select id from public.suppliers where status <> ''verified'' limit 1')::uuid,
  'e9000000-0000-4000-8000-000000000001', 'lalamove', 'MOTORCYCLE', 9000) $$, '22023', null, 'a quote for a supplier that is not verified is rejected');
select throws_ok($$ select * from public.save_courier_quote('e6000000-0000-4000-8000-000000000001', 'e7000000-0000-4000-8000-000000000001',
  'e9000000-0000-4000-8000-000000000001', 'lalamove', 'MOTORCYCLE', 0) $$, '23514', null, 'a zero price is rejected');
select ok((select expires_at from public.save_courier_quote('e6000000-0000-4000-8000-000000000001', 'e7000000-0000-4000-8000-000000000001',
  'e9000000-0000-4000-8000-000000000001', 'lalamove', 'MOTORCYCLE', 9000)) > now() + interval '14 minutes', 'the quote lives for the admin setting (15 minutes)');
set local role authenticated;
select pg_temp.as_user('e6000000-0000-4000-8000-000000000001');
select throws_ok($$ select * from public.save_courier_quote('e6000000-0000-4000-8000-000000000001', 'e7000000-0000-4000-8000-000000000001',
  'e9000000-0000-4000-8000-000000000001', 'lalamove', 'MOTORCYCLE', 1) $$, '42501', null, 'a buyer cannot save quotes');
select is((select count(*)::int from public.courier_quotes), 2, 'the buyer reads their own quotes');
select pg_temp.as_user('e6000000-0000-4000-8000-000000000004');
select is((select count(*)::int from public.courier_quotes), 0, 'another buyer reads none');

-- ------------------------------------------------------------ start_checkout with quotes
select pg_temp.as_user(pg_temp.buyer());
insert into ids select 'qx', pg_temp.sq(pg_temp.buyer(), 'e7000000-0000-4000-8000-000000000001', 'e9000000-0000-4000-8000-000000000001', 5000);
select pg_temp.run('update public.courier_quotes set expires_at = now() - interval ''1 minute'' where id = ''' || (select v from ids where k = 'qx') || '''');
insert into ids select 'qo', pg_temp.sq('e6000000-0000-4000-8000-000000000004', 'e7000000-0000-4000-8000-000000000001', 'e9000000-0000-4000-8000-000000000003', 5000);
insert into ids select 'qa2', pg_temp.sq(pg_temp.buyer(), 'e7000000-0000-4000-8000-000000000001', 'e9000000-0000-4000-8000-000000000002', 5000);
insert into ids select 'q1b', pg_temp.sq(pg_temp.buyer(), 'e7000000-0000-4000-8000-000000000001', 'e9000000-0000-4000-8000-000000000001', 7000);
insert into ids select 'q1c', pg_temp.sq(pg_temp.buyer(), 'e7000000-0000-4000-8000-000000000001', 'e9000000-0000-4000-8000-000000000001', 8000);
insert into ids select 'q2', pg_temp.sq(pg_temp.buyer(), 'e7000000-0000-4000-8000-000000000002', 'e9000000-0000-4000-8000-000000000001', 6000);
select pg_temp.cart('e8000000-0000-4000-8000-000000000001');
select throws_ok($$ select * from public.start_checkout(gen_random_uuid(), 'qrph', 'e9000000-0000-4000-8000-000000000001', 'online',
  array[(select v from ids where k = 'qx')]) $$, '22023', 'The delivery price expired. Refresh it and try again.', 'an expired quote is rejected');
select throws_ok($$ select * from public.start_checkout(gen_random_uuid(), 'qrph', 'e9000000-0000-4000-8000-000000000001', 'online',
  array[(select v from ids where k = 'qo')]) $$, 'P0002', 'Delivery price not found', 'another buyer''s quote is rejected');
select throws_ok($$ select * from public.start_checkout(gen_random_uuid(), 'qrph', 'e9000000-0000-4000-8000-000000000001', 'online',
  array[(select v from ids where k = 'qa2')]) $$, 'P0002', 'Delivery price not found', 'a quote for a different address is rejected');
select throws_ok($$ select * from public.start_checkout(gen_random_uuid(), 'qrph', 'e9000000-0000-4000-8000-000000000001', 'online',
  array[(select v from ids where k = 'q1b'), (select v from ids where k = 'q1c')]) $$, 'P0002', null, 'two quotes for one supplier are rejected');
select throws_ok($$ select * from public.start_checkout(gen_random_uuid(), 'qrph', 'e9000000-0000-4000-8000-000000000001', 'online',
  array[(select v from ids where k = 'q2')]) $$, 'P0002', null, 'a quote for a supplier that is not in the cart is rejected');

delete from public.cart_items;
insert into public.cart_items (product_id, quantity) values
  ('e8000000-0000-4000-8000-000000000001', 1), ('e8000000-0000-4000-8000-000000000002', 1);
select lives_ok($$ select * from public.start_checkout('e6100000-0000-4000-8000-000000000001', 'qrph', 'e9000000-0000-4000-8000-000000000001', 'online',
  array[(select v from ids where k = 'q1b')]) $$, 'checkout with one quote of two suppliers');
select is(pg_temp.val('select shipping_centavos || '':'' || total_centavos || '':'' || (shipping_quote_id = (select v from ids where k = ''q1b'')) from public.orders
  where supplier_id = ''e7000000-0000-4000-8000-000000000001'' and checkout_id = (select id from public.checkouts where idempotency_key = ''e6100000-0000-4000-8000-000000000001'')'),
  '7000:17000:true', 'the quoted price is frozen into shipping_centavos with its quote id');
select is(pg_temp.val('select shipping_centavos || '':'' || coalesce(shipping_quote_id::text, ''none'') from public.orders
  where supplier_id = ''e7000000-0000-4000-8000-000000000002'' and checkout_id = (select id from public.checkouts where idempotency_key = ''e6100000-0000-4000-8000-000000000001'')'),
  '15000:none', 'a supplier without a quote gets the zone fee');

-- ------------------------------------------------------------ order with a quote, paid; booking with a lower price
insert into ids select 'below', pg_temp.buyq(9000);
select is(pg_temp.o((select v from ids where k = 'below'), 'status || '':'' || shipping_centavos || '':'' || total_centavos'), 'paid:9000:19000', 'paid order carries the quoted delivery');
select is(pg_temp.o((select v from ids where k = 'below'), '(ship_to ->> ''lat'')::numeric'), '14.554700', 'the address pin is copied into the order''s ship_to');
select is(pg_temp.o((select v from ids where k = 'below'), 'commission_centavos > 0'), 'true', 'the order has commission (so a refund would normally return some)');
reset role;
set local role service_role;
select is((public.begin_courier_booking((select v from ids where k = 'below'), 8500)) ->> 'action', 'book', 'a quote at or under what was paid books');
select is(pg_temp.o((select v from ids where k = 'below'), '(courier_booking_claimed_at is not null) || '':'' || shipping_due_centavos'), 'true:0', 'the booking is claimed, nothing due');
select throws_ok($$ select public.begin_courier_booking((select v from ids where k = 'below'), 8500) $$, '22023', null, 'a second begin while claimed is rejected');
set local role authenticated;
select pg_temp.as_user('e6000000-0000-4000-8000-000000000002');
select throws_ok($$ select public.check_can_book_shipment((select v from ids where k = 'below')) $$, '22023',
  'A booking is already in progress for this order. TULAY support will check it.', 'check_can_book rejects while claimed');
select throws_ok($$ select public.record_shipment((select v from ids where k = 'below'), 'fake', 'LL-X', 7000, null) $$,
  '42501', null, 'a supplier cannot record a booking');
set local role service_role;
select lives_ok($$ select public.record_shipment((select v from ids where k = 'below'), 'fake', 'LL-BELOW', 7000, 'https://share.example/below') $$,
  'booking recorded at the booked price');
select is(pg_temp.cp((select v from ids where k = 'below')), '7000', 'courier_payable is credited the booked price, not the fee paid');
select is(pg_temp.o((select v from ids where k = 'below'), 'courier_booking_claimed_at is null'), 'true', 'the claim is cleared');
select is(pg_temp.val('select price_centavos || '':'' || share_link from public.shipments where tracking_ref = ''LL-BELOW'''), '7000:https://share.example/below', 'price and share link stored');
-- refund of the excess
insert into ids select 'rf', public.refund_shipping_excess((select v from ids where k = 'below'));
select is(pg_temp.val('select amount_centavos || '':'' || shipping_adjustment || '':'' || status from public.refunds where id = ''' || (select v from ids where k = 'rf') || ''''),
  '2000:true:pending', 'one refund of held minus price, marked as a shipping adjustment');
select ok(public.refund_shipping_excess((select v from ids where k = 'below')) is null, 'a second call returns null');
select lives_ok($$ select public.complete_refund((select v from ids where k = 'rf'), 'rfref-1', true) $$, 'the refund completes');
select is(pg_temp.val('select count(*) from public.ledger_entries where refund_id = ''' || (select v from ids where k = 'rf') || ''' and account = ''platform_revenue'''),
  '0', 'no commission is returned for a delivery adjustment');
select is(pg_temp.val('select sum(debit_centavos) from public.ledger_entries where refund_id = ''' || (select v from ids where k = 'rf') || ''' and account = ''supplier_payable'''),
  '2000', 'the supplier gives back the whole difference');

-- ------------------------------------------------------------ equal price
set local role authenticated;
insert into ids select 'equal', pg_temp.buyq(9000);
set local role service_role;
select is((public.begin_courier_booking((select v from ids where k = 'equal'), 9000)) ->> 'action', 'book', 'a quote equal to what was paid books');
select lives_ok($$ select public.record_shipment((select v from ids where k = 'equal'), 'fake', 'LL-EQ', 9000, null) $$, 'booked at the paid price');
select is(pg_temp.cp((select v from ids where k = 'equal')), '9000', 'courier_payable is credited the booked price');
select ok(public.refund_shipping_excess((select v from ids where k = 'equal')) is null, 'nothing to refund when price equals what was paid');

-- ------------------------------------------------------------ price rose: top-up, then book above the first fee
set local role authenticated;
insert into ids select 'above', pg_temp.buyq(9000);
set local role service_role;
select is((public.begin_courier_booking((select v from ids where k = 'above'), 12000)) ->> 'due_centavos', '3000', 'a higher quote asks for the difference');
select is(pg_temp.o((select v from ids where k = 'above'), 'shipping_due_centavos || '':'' || (courier_booking_claimed_at is null)'), '3000:true', 'due is set and there is no claim');
select ok(pg_temp.notified('e6000000-0000-4000-8000-000000000001', 'Delivery price changed'), 'the buyer is told');
select throws_ok($$ select public.record_shipment((select v from ids where k = 'above'), 'fake', 'LL-ABOVE', 12000, null) $$,
  '22023', null, 'nothing is recorded while the buyer owes a difference');
set local role authenticated;
select pg_temp.as_user('e6000000-0000-4000-8000-000000000002');
select lives_ok($$ select public.check_can_book_shipment((select v from ids where k = 'above')) $$, 'a supplier may re-check the price while a difference is due');
select pg_temp.as_user(pg_temp.buyer());
select is((select amount_centavos from public.start_shipping_topup_checkout((select v from ids where k = 'above'), 'e6100000-0000-4000-8000-000000000002', 'qrph')),
  3000::bigint, 'the top-up checkout is for the difference');
select throws_ok($$ select * from public.start_shipping_topup_checkout((select v from ids where k = 'above'), 'e6100000-0000-4000-8000-000000000003', 'qrph') $$,
  '22023', null, 'one open top-up at a time');
select pg_temp.as_user('e6000000-0000-4000-8000-000000000004');
select throws_ok($$ select * from public.start_shipping_topup_checkout((select v from ids where k = 'above'), 'e6100000-0000-4000-8000-000000000004', 'qrph') $$,
  'P0002', null, 'only the buyer can pay a top-up');
select pg_temp.as_user(pg_temp.buyer());
select lives_ok($$ select public.attach_payment_session(
  (select id from public.checkouts where order_id = (select v from ids where k = 'above') and shipping_topup), 'fake', 'ref-top') $$, 'payment page opened');
set local role service_role;
select is(public.confirm_payment('fake', 'evt-top', 'ref-top', 3000, null, '{}'), 'paid', 'the gateway confirms the top-up');
select is(pg_temp.o((select v from ids where k = 'above'), 'shipping_centavos || '':'' || total_centavos || '':'' || paid_online_centavos || '':'' || shipping_due_centavos'),
  '12000:22000:22000:0', 'shipping, total and paid online grow by the top-up; due is back to 0');
select is(pg_temp.o((select v from ids where k = 'above'), 'total_centavos = items_centavos + fees_centavos + shipping_centavos'), 'true', 'total = items + fees + shipping still holds');
select ok(pg_temp.notified('e6000000-0000-4000-8000-000000000002', 'Delivery difference paid'), 'the supplier is told to book again');
select is((public.begin_courier_booking((select v from ids where k = 'above'), 12000)) ->> 'action', 'book', 'after the top-up the booking goes ahead');
select lives_ok($$ select public.record_shipment((select v from ids where k = 'above'), 'fake', 'LL-ABOVE', 11500, null) $$, 'booked above the first fee');
select is(pg_temp.cp((select v from ids where k = 'above')), '11500', 'courier_payable is credited the booked price');
select is(pg_temp.val('select amount_centavos from public.refunds where id = ''' || public.refund_shipping_excess((select v from ids where k = 'above')) || ''''),
  '500', 'the buyer gets back what the courier took less than the top-up total');

-- ------------------------------------------------------------ replace_shipment_ref
select ok(public.replace_shipment_ref('fake', 'LL-ABOVE', 'LL-ABOVE2'), 'the reference is replaced');
select is(pg_temp.val('select tracking_ref from public.shipments where order_id = ''' || (select v from ids where k = 'above') || ''''), 'LL-ABOVE2', 'the shipment has the new reference');
select ok(not public.replace_shipment_ref('fake', 'LL-ABOVE', 'LL-ABOVE3'), 'the old reference no longer matches');

-- ------------------------------------------------------------ void
select ok(public.void_shipment(pg_temp.sid('LL-EQ'), 'Expired'), 'a booking is voided');
select ok(not public.void_shipment(pg_temp.sid('LL-EQ'), 'Expired'), 'a second void does nothing');
select is(pg_temp.cp((select v from ids where k = 'equal')), '0', 'the booking is reversed exactly once');
select is(pg_temp.val('select count(*) from public.ledger_entries where memo = ''Courier booking voided'' and order_id = ''' || (select v from ids where k = 'equal') || ''''),
  '2', 'two reversing lines, no more');
select ok(pg_temp.notified('e6000000-0000-4000-8000-000000000002', 'Courier booking ended'), 'the supplier is told');
select is(pg_temp.val('select voided_at is not null || '':'' || void_reason from public.shipments where tracking_ref = ''LL-EQ'''), 'true:Expired', 'shipment marked voided with the reason');
-- the order can be booked again
select is((public.begin_courier_booking((select v from ids where k = 'equal'), 9000)) ->> 'action', 'book', 'a new booking after the void is allowed');
select lives_ok($$ select public.record_shipment((select v from ids where k = 'equal'), 'fake', 'LL-EQ2', 9000, null) $$, 'the second booking is recorded');
select is(pg_temp.cp((select v from ids where k = 'equal')), '9000', 'only the active booking is owed to the courier');
-- events for a voided booking are ignored
select is(public.record_tracking_event('fake', 'evt-void-1', 'LL-EQ', 'picked_up', now(), '', null, '{}'), 'unknown', 'events for a voided booking are ignored');
-- picked up cannot be voided
select is(public.record_tracking_event('fake', 'evt-pk-1', 'LL-EQ2', 'picked_up', now(), '', null, '{}'), 'recorded', 'the active booking is picked up');
select throws_ok($$ select public.void_shipment(pg_temp.sid('LL-EQ2'), 'x') $$,
  '22023', 'Only a booking not picked up yet can be voided', 'a picked-up shipment cannot be voided');
-- by ref
select is(public.void_shipment_by_ref('fake', 'NO-SUCH', 'x'), 'unknown', 'void by an unknown ref');
select is(public.void_shipment_by_ref('fake', 'LL-EQ2', 'Cancelled'), 'flagged', 'a picked-up booking is flagged, not voided');
select ok(pg_temp.notified('e6000000-0000-4000-8000-000000000005', 'Courier needs a check'), 'support is told');
select is(public.void_shipment_by_ref('fake', 'LL-BELOW', 'Rejected'), 'voided', 'a booked shipment is voided by ref');
select is(public.record_tracking_event('fake', 'evt-void-2', 'LL-BELOW', 'picked_up', now(), '', null, '{}'), 'unknown', 'a voided ref receives no events');
select is(pg_temp.o((select v from ids where k = 'below'), 'status::text'), 'paid', 'the order did not move');
select lives_ok($$ select public.flag_courier_issue('fake', 'NO-SUCH', null, 'unknown ref') $$, 'flagging an unknown ref only audits');
-- a manual shipment after a void works
set local role authenticated;
select pg_temp.as_user('e6000000-0000-4000-8000-000000000002');
select lives_ok($$ select public.record_manual_shipment((select v from ids where k = 'below'), 'lbc', '', 'LBC-1') $$, 'own-courier shipment after a void');
select is(pg_temp.o((select v from ids where k = 'below'), 'status::text'), 'shipped', 'the order is on the way');
select is(pg_temp.cp((select v from ids where k = 'below')), '0', 'a manual shipment leaves courier_payable alone (the voided booking was reversed)');
-- exactly one active shipment per order
select pg_temp.as_user(pg_temp.buyer());
select is(pg_temp.o((select v from ids where k = 'below'), '(select count(*) from public.shipments s where s.order_id = orders.id and s.voided_at is null)'), '1', 'one active shipment per order');

-- ------------------------------------------------------------ release / support
set local role service_role;
select lives_ok($$ select public.release_courier_booking((select v from ids where k = 'below'), 'courier said no') $$, 'service role releases a claim');
set local role authenticated;
select pg_temp.as_user('e6000000-0000-4000-8000-000000000002');
select throws_ok($$ select public.release_courier_booking((select v from ids where k = 'below'), 'x') $$, '42501', null, 'a supplier cannot release a claim');
select throws_ok($$ select public.void_shipment(pg_temp.sid('LL-EQ2'), 'x') $$, '42501', null, 'a supplier cannot void');
select throws_ok($$ select public.begin_courier_booking((select v from ids where k = 'below'), 1000) $$, '42501', null, 'a supplier cannot begin a booking');
select pg_temp.as_user('e6000000-0000-4000-8000-000000000005', 'aal2');
select throws_ok($$ select public.admin_release_courier_booking((select v from ids where k = 'above'), '') $$, '22023', null, 'releasing needs a reason');
select lives_ok($$ select public.admin_release_courier_booking((select v from ids where k = 'above'), 'checked the dashboard') $$, 'support releases a claim');
select throws_ok($$ select public.admin_void_shipment((select v from ids where k = 'above'), 'x') $$, '22023', null, 'voiding needs a reason');
select lives_ok($$ select public.admin_void_shipment((select v from ids where k = 'above'), 'Courier cancelled') $$, 'support voids a booking that is not picked up');
select pg_temp.as_user(pg_temp.buyer());
select throws_ok($$ select public.admin_void_shipment((select v from ids where k = 'above'), 'Courier cancelled') $$, '42501', null, 'a buyer is not support');

-- ------------------------------------------------------------ review fixes
create function pg_temp.topup(p_order uuid, p_ref text) returns uuid language plpgsql as $$
declare c uuid; prev text := current_setting('role');
begin
  perform set_config('role', 'authenticated', true);
  perform pg_temp.as_user(pg_temp.buyer());
  select s.checkout_id into c from public.start_shipping_topup_checkout(p_order, gen_random_uuid(), 'qrph') s;
  perform public.attach_payment_session(c, 'fake', p_ref);
  perform set_config('role', prev, true);
  return c;
end $$;
grant execute on function pg_temp.topup(uuid, text) to authenticated, service_role;

-- A. booking again at a lower price closes the open top-up; its late payment goes to review
select pg_temp.as_user(pg_temp.buyer());
insert into ids select 'late', pg_temp.buyq(9000);
set local role service_role;
select is((public.begin_courier_booking((select v from ids where k = 'late'), 12000)) ->> 'action', 'topup', 'late: a top-up is asked');
insert into ids select 'latec', pg_temp.topup((select v from ids where k = 'late'), 'ref-late');
select is((public.begin_courier_booking((select v from ids where k = 'late'), 8000)) ->> 'action', 'book', 'late: a lower price books');
select is(pg_temp.val('select status::text from public.checkouts where id = ''' || (select v from ids where k = 'latec') || ''''), 'cancelled', 'the open top-up checkout is released');
select is(pg_temp.o((select v from ids where k = 'late'), 'shipping_due_centavos'), '0', 'nothing is due');
select is(public.confirm_payment('fake', 'evt-late', 'ref-late', 3000, null, '{}'), 'needs_review', 'a late top-up payment goes to review');
select is(pg_temp.o((select v from ids where k = 'late'), 'shipping_centavos || '':'' || paid_online_centavos'), '9000:19000', 'the order did not change');
-- manual shipment is rejected while a booking is claimed
set local role authenticated;
select pg_temp.as_user('e6000000-0000-4000-8000-000000000002');
select throws_ok($$ select public.record_manual_shipment((select v from ids where k = 'late'), 'lbc', '', 'LBC-L') $$, '22023',
  'A booking is already in progress for this order. TULAY support will check it.', 'manual shipment rejected while claimed');
-- top-up checkout rejected with a claim / active shipment
select pg_temp.run('update public.orders set shipping_due_centavos = 500 where id = ''' || (select v from ids where k = 'late') || '''');
select pg_temp.as_user(pg_temp.buyer());
select throws_ok($$ select * from public.start_shipping_topup_checkout((select v from ids where k = 'late'), gen_random_uuid(), 'qrph') $$, '22023',
  'This order already has a courier booking', 'no top-up while a booking is claimed');
set local role service_role;
select pg_temp.run('update public.orders set shipping_due_centavos = 0 where id = ''' || (select v from ids where k = 'late') || '''');
select public.record_shipment((select v from ids where k = 'late'), 'fake', 'LL-LATE', 8000, null);
select pg_temp.run('update public.orders set shipping_due_centavos = 500 where id = ''' || (select v from ids where k = 'late') || '''');
set local role authenticated;
select pg_temp.as_user(pg_temp.buyer());
select throws_ok($$ select * from public.start_shipping_topup_checkout((select v from ids where k = 'late'), gen_random_uuid(), 'qrph') $$, '22023',
  'This order already has a courier booking', 'no top-up with an active shipment');

-- B. a manual shipment clears what was owed and closes the open top-up
insert into ids select 'man', pg_temp.buyq(9000);
set local role service_role;
select public.begin_courier_booking((select v from ids where k = 'man'), 12000);
insert into ids select 'manc', pg_temp.topup((select v from ids where k = 'man'), 'ref-man');
set local role authenticated;
select pg_temp.as_user('e6000000-0000-4000-8000-000000000002');
select lives_ok($$ select public.record_manual_shipment((select v from ids where k = 'man'), 'lbc', '', 'LBC-M') $$, 'manual shipment after a top-up was asked');
select is(pg_temp.o((select v from ids where k = 'man'), 'shipping_due_centavos'), '0', 'due is cleared');
select is(pg_temp.val('select status::text from public.checkouts where id = ''' || (select v from ids where k = 'manc') || ''''), 'cancelled', 'the top-up checkout is released');

-- C. cancelling with a pending top-up: the cancel trigger already closes it (no extra code needed)
select pg_temp.as_user(pg_temp.buyer());
insert into ids select 'canc', pg_temp.buyq(9000);
set local role service_role;
select public.begin_courier_booking((select v from ids where k = 'canc'), 12000);
insert into ids select 'cancc', pg_temp.topup((select v from ids where k = 'canc'), 'ref-canc');
set local role authenticated;
select pg_temp.as_user(pg_temp.buyer());
select lives_ok($$ select public.cancel_order((select v from ids where k = 'canc')) $$, 'the buyer cancels with a top-up open');
select is(pg_temp.val('select status::text from public.checkouts where id = ''' || (select v from ids where k = 'cancc') || ''''), 'cancelled', 'the cancel closed the top-up checkout');
select is(pg_temp.o((select v from ids where k = 'canc'), 'shipping_due_centavos'), '0', 'due cleared on cancel');
set local role service_role;
select is(public.confirm_payment('fake', 'evt-canc', 'ref-canc', 3000, null, '{}'), 'needs_review', 'a top-up paid after the cancel goes to review');
select is(pg_temp.o((select v from ids where k = 'canc'), 'shipping_centavos || '':'' || paid_online_centavos'), '9000:19000', 'the cancelled order did not gain the top-up');

-- D. the confirm_checkout guard: a top-up that is no longer owed is not applied
set local role authenticated;
select pg_temp.as_user(pg_temp.buyer());
insert into ids select 'guard', pg_temp.buyq(9000);
set local role service_role;
select public.begin_courier_booking((select v from ids where k = 'guard'), 12000);
insert into ids select 'guardc', pg_temp.topup((select v from ids where k = 'guard'), 'ref-guard');
select pg_temp.run('update public.orders set shipping_due_centavos = 0 where id = ''' || (select v from ids where k = 'guard') || '''');
select is(public.confirm_payment('fake', 'evt-guard', 'ref-guard', 3000, null, '{}'), 'paid', 'the gateway reports it paid');
select is(pg_temp.val('select status::text from public.payments where provider_ref = ''ref-guard'''), 'needs_review', 'the payment is held for review');
select is(pg_temp.o((select v from ids where k = 'guard'), 'shipping_centavos || '':'' || paid_online_centavos'), '9000:19000', 'the order did not change');
select is(pg_temp.val('select sum(e.credit_centavos)::text from public.ledger_entries e join public.payments p on p.id = e.payment_id
  where p.provider_ref = ''ref-guard'' and e.account = ''unmatched_payments'''), '3000', 'the payment is held as unmatched');
select is(pg_temp.val('select count(*)::text from (select e.txn_id from public.ledger_entries e join public.payments p on p.id = e.payment_id
  where p.provider_ref = ''ref-guard'' group by e.txn_id having sum(e.debit_centavos) <> sum(e.credit_centavos)) x'), '0',
  'every ledger transaction for it balances');
select is(pg_temp.val('select c.status::text from public.checkouts c join public.payments p on p.checkout_id = c.id where p.provider_ref = ''ref-guard'''),
  'needs_review', 'the top-up checkout is marked for review, not paid');

-- E. COD orders cannot be booked on Lalamove
set local role authenticated;
select pg_temp.as_user(pg_temp.buyer());
insert into ids select 'codo', pg_temp.buyq(9000);
select pg_temp.run('update public.orders set payment_option = ''cod'' where id = ''' || (select v from ids where k = 'codo') || '''');
set local role service_role;
select throws_ok($$ select public.begin_courier_booking((select v from ids where k = 'codo'), 9000) $$, '22023',
  'Cash on delivery orders cannot be booked on Lalamove yet. Ship with your own courier.', 'a COD order is not booked on Lalamove');

-- F. a booked price above what the buyer paid flags support
set local role authenticated;
select pg_temp.as_user(pg_temp.buyer());
insert into ids select 'gap', pg_temp.buyq(9000);
set local role service_role;
select public.begin_courier_booking((select v from ids where k = 'gap'), 9000);
select lives_ok($$ select public.record_shipment((select v from ids where k = 'gap'), 'fake', 'LL-GAP', 11500, null) $$, 'booked above the paid delivery');
select ok(pg_temp.val('select count(*) from public.notifications where user_id = ''e6000000-0000-4000-8000-000000000005'' and body like ''Booked at PHP 115.00, above what the buyer paid for delivery (PHP 90.00)%''')::int = 1,
  'support is told about the gap');

-- G. a reissued delivery refund stays a shipping adjustment
set local role authenticated;
select pg_temp.as_user(pg_temp.buyer());
insert into ids select 'redo', pg_temp.buyq(9000);
set local role service_role;
select public.begin_courier_booking((select v from ids where k = 'redo'), 9000);
select public.record_shipment((select v from ids where k = 'redo'), 'fake', 'LL-REDO', 8000, null);
insert into ids select 'redorf', public.refund_shipping_excess((select v from ids where k = 'redo'));
select public.complete_refund((select v from ids where k = 'redorf'), null, false);
set local role authenticated;
select pg_temp.as_user('e6000000-0000-4000-8000-000000000005', 'aal2');
insert into ids select 'redorf2', public.admin_reissue_refund((select v from ids where k = 'redorf'), gen_random_uuid());
select is(pg_temp.val('select shipping_adjustment::text from public.refunds where id = ''' || (select v from ids where k = 'redorf2') || ''''), 'true', 'the reissued refund keeps shipping_adjustment');

-- H. cancel is blocked by a claim and allowed after a void
select pg_temp.as_user(pg_temp.buyer());
insert into ids select 'cv', pg_temp.buyq(9000);
set local role service_role;
select public.begin_courier_booking((select v from ids where k = 'cv'), 9000);
set local role authenticated;
select pg_temp.as_user(pg_temp.buyer());
select throws_ok($$ select public.cancel_order((select v from ids where k = 'cv')) $$, '22023', null, 'cancel is blocked while a booking is claimed');
set local role service_role;
select public.record_shipment((select v from ids where k = 'cv'), 'fake', 'LL-CV', 9000, null);
select is(public.void_shipment_by_ref('fake', 'LL-CV', 'Expired'), 'voided', 'the booking is voided');
set local role authenticated;
select pg_temp.as_user(pg_temp.buyer());
select lives_ok($$ select public.cancel_order((select v from ids where k = 'cv')) $$, 'cancel is allowed after the void');

-- I. a higher quote while a difference is due replaces it and closes the old top-up checkout
set local role authenticated;
select pg_temp.as_user(pg_temp.buyer());
insert into ids select 'dh', pg_temp.buyq(9000);
set local role service_role;
select public.begin_courier_booking((select v from ids where k = 'dh'), 12000);
insert into ids select 'dhc', pg_temp.topup((select v from ids where k = 'dh'), 'ref-dh');
select is((public.begin_courier_booking((select v from ids where k = 'dh'), 13000)) ->> 'due_centavos', '4000', 'a higher quote asks for the new difference');
select is(pg_temp.val('select status::text from public.checkouts where id = ''' || (select v from ids where k = 'dhc') || ''''), 'cancelled', 'the old top-up checkout is closed');
select is(pg_temp.o((select v from ids where k = 'dh'), 'shipping_due_centavos'), '4000', 'due is the current difference only');

-- J. support records a booking found in the courier dashboard
set local role authenticated;
select pg_temp.as_user(pg_temp.buyer());
insert into ids select 'adm', pg_temp.buyq(9000);
set local role service_role;
select public.begin_courier_booking((select v from ids where k = 'adm'), 9000);
set local role authenticated;
select throws_ok($$ select public.admin_record_courier_booking((select v from ids where k = 'adm'), 'lalamove', 'LL-ADM', 8000, null) $$, '42501', null, 'a buyer cannot record a booking for support');
select pg_temp.as_user('e6000000-0000-4000-8000-000000000005', 'aal2');
select throws_ok($$ select public.admin_record_courier_booking((select v from ids where k = 'adm'), 'lalamove', 'LL-ADM', 8000, 'http://x') $$, '22023', null, 'a share link must be https');
select is((public.admin_record_courier_booking((select v from ids where k = 'adm'), 'lalamove', 'LL-ADM', 8000, 'https://share.example/adm')) ->> 'refund_id' is not null, true, 'support records the booking and the excess is refunded');
select is(pg_temp.o((select v from ids where k = 'adm'), 'courier_booking_claimed_at is null'), 'true', 'the claim is cleared');
select is(pg_temp.cp((select v from ids where k = 'adm')), '8000', 'courier_payable is credited the booked price');
select is(pg_temp.val('select amount_centavos || '':'' || shipping_adjustment from public.refunds where order_id = ''' || (select v from ids where k = 'adm') || ''''), '1000:true', 'the excess refund exists');

-- K. minimum top-up: a gap under the setting (2000) is absorbed by the supplier
set local role authenticated;
select pg_temp.as_user(pg_temp.buyer());
insert into ids select 'g1', pg_temp.buyq(9000);
insert into ids select 'g2', pg_temp.buyq(9000);
set local role service_role;
select is((public.begin_courier_booking((select v from ids where k = 'g1'), 10999)) ->> 'action', 'book', 'a gap of 1999 books without a top-up');
select is(pg_temp.o((select v from ids where k = 'g1'), 'shipping_due_centavos'), '0', 'nothing is due');
select public.record_shipment((select v from ids where k = 'g1'), 'fake', 'LL-G1', 10999, null);
select is(pg_temp.val('select count(*) from public.notifications where body like ''Booked at PHP 109.99%'''), '0', 'no support flag for a small gap');
select is(pg_temp.cp((select v from ids where k = 'g1')), '10999', 'the full booked price is owed to the courier');
select is((public.begin_courier_booking((select v from ids where k = 'g2'), 11000)) ->> 'action', 'topup', 'a gap of 2000 asks for a top-up');
set local role authenticated;

-- ------------------------------------------------------------ pickup settings and addresses
select pg_temp.as_user('e6000000-0000-4000-8000-000000000002');
select lives_ok($$ select public.set_pickup_settings('Lala Co', '09171234567', '1 St', '', '', 'Pasig', 'Metro Manila', '1600', 800, 14.5600, 121.0600, ' MOTORCYCLE ') $$,
  'pickup saved with coordinates and vehicle');
select is((select lat || ':' || lng || ':' || lalamove_service_type from public.supplier_pickup_settings), '14.560000:121.060000:MOTORCYCLE', 'coordinates and service type stored');
select throws_ok($$ select public.set_pickup_settings('Lala Co', '09171234567', '1 St', '', '', 'Pasig', 'Metro Manila', '1600', 800, 121.06, 14.56, null) $$,
  '23514', null, 'swapped coordinates rejected');
select throws_ok($$ select public.set_pickup_settings('Lala Co', '09171234567', '1 St', '', '', 'Pasig', 'Metro Manila', '1600', 800, 48.85, 2.35, null) $$,
  '23514', null, 'coordinates outside the Philippines rejected');
select throws_ok($$ select public.set_pickup_settings('Lala Co', '09171234567', '1 St', '', '', 'Pasig', 'Metro Manila', '1600', 800, 14.56, null, null) $$,
  '23514', null, 'one coordinate alone rejected');
select throws_ok($$ select public.set_pickup_settings('Lala Co', '09171234567', '1 St', '', '', 'Pasig', 'Metro Manila', '1600', 800, null, null, 'motorcycle') $$,
  '23514', null, 'a bad service type rejected');
select lives_ok($$ select public.set_pickup_settings('Lala Co', '09171234567', '1 St', '', '', 'Pasig', 'Metro Manila', '1600', 800) $$, 'the old nine-argument call still works');
select is((select (lat is null)::text || ':' || (lalamove_service_type is null)::text from public.supplier_pickup_settings), 'true:true', 'unset coordinates and vehicle are null');
select pg_temp.as_user(pg_temp.buyer());
select lives_ok($$ insert into public.addresses (recipient, phone, line1, city, province, lat, lng)
  values ('Buyer', '09171234567', '9 St', 'Taguig', 'Metro Manila', 14.5176, 121.0509) $$, 'a buyer saves an address with a pin');
select throws_ok($$ insert into public.addresses (recipient, phone, line1, city, province, lat, lng)
  values ('Buyer', '09171234567', '9 St', 'Taguig', 'Metro Manila', 14.5176, null) $$, '23514', null, 'an address needs both coordinates or none');
select throws_ok($$ insert into public.addresses (recipient, phone, line1, city, province, lat, lng)
  values ('Buyer', '09171234567', '9 St', 'Taguig', 'Metro Manila', 3, 121) $$, '23514', null, 'an address outside the Philippines is rejected');

select * from finish();
rollback;
