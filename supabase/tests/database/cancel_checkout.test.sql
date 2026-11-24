-- cancel_checkout: a buyer frees their own unpaid cart checkout; a late payment is flagged for refund.
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

update public.suppliers set status = 'suspended';

insert into auth.users (id, email, raw_user_meta_data) values
  ('f5000000-0000-4000-8000-000000000001', 'cb@test.ph', '{"role":"buyer"}'),
  ('f5000000-0000-4000-8000-000000000002', 'cs@test.ph', '{"role":"supplier"}'),
  ('f5000000-0000-4000-8000-000000000003', 'cx@test.ph', '{"role":"buyer"}');
insert into public.suppliers (id, owner_id, business_name, legal_name, category_id, city, province, moq, lead_days, description, status)
values ('f6000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000002', 'Cancel Co', 'Cancel Co',
  (select id from public.categories where slug = 'custom-shirts'), 'Pasig', 'Metro Manila', 1, 7, 'x', 'verified');
insert into public.products (id, supplier_id, category_id, title, description, moq, unit, indicative_price_centavos, return_class, status, idempotency_key, stock)
values ('f7000000-0000-4000-8000-000000000001', 'f6000000-0000-4000-8000-000000000001',
  (select id from public.categories where slug = 'custom-shirts'), 'Tracked tee', 'x', 1, 'pcs', 10000, 'standard', 'approved', gen_random_uuid(), 10);
insert into public.addresses (id, user_id, label, recipient, phone, line1, line2, barangay, city, province, postal_code)
values ('f8000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000001', 'Office', 'Buyer', '09171234567', '1 St', '', 'Poblacion', 'Makati', 'Metro Manila', '1200');

create function pg_temp.as_user(u text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated', 'aal', 'aal1')::text, true); $$;
create function pg_temp.checkout(ref text) returns table (cid uuid, amt bigint) language plpgsql as $$
declare c uuid; d bigint;
begin
  delete from public.cart_items where user_id = 'f5000000-0000-4000-8000-000000000001';
  insert into public.cart_items (user_id, product_id, quantity) values ('f5000000-0000-4000-8000-000000000001', 'f7000000-0000-4000-8000-000000000001', 3);
  perform pg_temp.as_user('f5000000-0000-4000-8000-000000000001');
  select s.checkout_id, s.amount_centavos into c, d from public.start_checkout(gen_random_uuid(), 'qrph', 'f8000000-0000-4000-8000-000000000001', 'online') s;
  perform public.attach_payment_session(c, 'fake', ref);
  return query select c, d;
end $$;

-- 1. Cancel frees the buyer: orders cancelled, stock back, cart kept, a new checkout works at once.
create temp table c1 as select * from pg_temp.checkout('fake_cancel1');
select is((select stock from public.products where id = 'f7000000-0000-4000-8000-000000000001'), 7, 'stock is held while the payment page is open');
select throws_ok($$ select public.start_checkout(gen_random_uuid(), 'qrph', 'f8000000-0000-4000-8000-000000000001', 'online') $$,
  '22023', null, 'a second checkout is blocked while the payment is open');
select pg_temp.as_user('f5000000-0000-4000-8000-000000000003');
select throws_ok($$ select public.cancel_checkout((select cid from c1)) $$, 'P0002', null, 'another buyer cannot cancel it');
select pg_temp.as_user('f5000000-0000-4000-8000-000000000001');
select lives_ok($$ select public.cancel_checkout((select cid from c1)) $$, 'the buyer cancels their own checkout');
select is((select status::text from public.orders where checkout_id = (select cid from c1)), 'cancelled', 'its order is cancelled');
select is((select stock from public.products where id = 'f7000000-0000-4000-8000-000000000001'), 10, 'the held stock is returned');
select is((select count(*)::int from public.cart_items where user_id = 'f5000000-0000-4000-8000-000000000001'), 1, 'the cart is kept for editing');
select throws_ok($$ select public.cancel_checkout((select cid from c1)) $$, '22023', null, 'a closed checkout cannot be cancelled twice');

-- 2. A payment that lands after the cancel is not lost: it is flagged for refund and nothing ships.
create temp table c2 as select * from pg_temp.checkout('fake_cancel2');
select public.cancel_checkout((select cid from c2));
select is(public.confirm_payment('fake', 'evt_cancel2', 'fake_cancel2', (select amt from c2), null, '{}'), 'needs_review', 'a late payment is flagged for refund');
select is((select status::text from public.orders where checkout_id = (select cid from c2)), 'cancelled', 'the order stays cancelled');

select * from finish();
rollback;
