-- Refunds are split across the order's paid payments (cart/deal, balance, delivery top-up), newest first, so a refund
-- never exceeds the payment it is sent against. Claims resolve only when every part of the group is done.
begin;
create extension if not exists pgtap with schema extensions;
select plan(47);

update public.suppliers set status = 'suspended'; -- hide seed suppliers; rolled back at the end

insert into auth.users (id, email, raw_user_meta_data) values
  ('d6000000-0000-4000-8000-000000000001', 'rsb@test.ph', '{"role":"buyer"}'),
  ('d6000000-0000-4000-8000-000000000002', 'rss1@test.ph', '{"role":"supplier"}'),
  ('d6000000-0000-4000-8000-000000000003', 'rss2@test.ph', '{"role":"supplier"}'),
  ('d6000000-0000-4000-8000-000000000005', 'rsa@test.ph', '{"role":"buyer"}');
update public.profiles set role = 'admin' where id = 'd6000000-0000-4000-8000-000000000005';
insert into public.admin_roles (user_id, sub_role) values ('d6000000-0000-4000-8000-000000000005', 'finance');
insert into public.suppliers (id, owner_id, business_name, legal_name, category_id, city, province, moq, lead_days, description, status)
select v.id, v.owner, v.name, v.name, (select id from public.categories where slug = 'mailers'), 'Pasig', 'Metro Manila', 1, 7, 'x', 'verified'
from (values
  ('d7000000-0000-4000-8000-000000000001'::uuid, 'd6000000-0000-4000-8000-000000000002'::uuid, 'Split Co'),
  ('d7000000-0000-4000-8000-000000000002'::uuid, 'd6000000-0000-4000-8000-000000000003'::uuid, 'Split Two')
) as v (id, owner, name);
insert into public.products (id, supplier_id, category_id, title, description, moq, unit, indicative_price_centavos, return_class, status, idempotency_key)
select v.id, v.sup, (select id from public.categories where slug = 'mailers'), v.title, 'x', 1, 'pcs', v.price, 'standard', 'approved', gen_random_uuid()
from (values
  ('d8000000-0000-4000-8000-000000000001'::uuid, 'd7000000-0000-4000-8000-000000000001'::uuid, 'Box A', 10000::bigint),
  ('d8000000-0000-4000-8000-000000000002'::uuid, 'd7000000-0000-4000-8000-000000000002'::uuid, 'Box B', 20000::bigint)
) as v (id, sup, title, price);
insert into public.addresses (id, user_id, recipient, phone, line1, city, province, lat, lng) values
  ('d9000000-0000-4000-8000-000000000001', 'd6000000-0000-4000-8000-000000000001', 'Buyer', '09171234567', '1 St', 'Makati', 'Metro Manila', 14.5547, 121.0244);
-- 10% commission, so a normal refund gives commission back.
insert into public.commission_schedules (category_id, rate_bps, starts_at, note)
values ((select id from public.categories where slug = 'mailers'), 1000, now() - interval '1 day', 'test');

create function pg_temp.as_user(p_id text, p_aal text default 'aal1') returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated', 'aal', p_aal)::text, true);
$$;
create function pg_temp.buyer() returns text language sql as $$ select 'd6000000-0000-4000-8000-000000000001'::text $$;
create function pg_temp.last_order() returns uuid language sql as $$ select id from public.orders order by ref desc limit 1 $$;
create function pg_temp.val(p_sql text) returns text language plpgsql security definer as $$
declare r text;
begin execute p_sql into r; return r; end $$;
create function pg_temp.sq(p_amt bigint) returns uuid language plpgsql as $$
declare q uuid; prev text := current_setting('role');
begin
  perform set_config('role', 'service_role', true);
  select s.id into q from public.save_courier_quote(pg_temp.buyer()::uuid, 'd7000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001', 'fake', 'MOTORCYCLE', p_amt) s;
  perform set_config('role', prev, true);
  return q;
end $$;
-- Buyer buys Box A with a 9,000 delivery quote and pays online at once: 19,000 paid. Returns the order id.
create function pg_temp.buyq() returns uuid language plpgsql as $$
declare co uuid; due bigint; ref text := 'r' || gen_random_uuid(); q uuid := pg_temp.sq(9000);
begin
  perform set_config('role', 'authenticated', true);
  perform pg_temp.as_user(pg_temp.buyer());
  delete from public.cart_items;
  insert into public.cart_items (product_id, quantity) values ('d8000000-0000-4000-8000-000000000001', 1);
  select s.checkout_id, s.amount_centavos into co, due
  from public.start_checkout(gen_random_uuid(), 'qrph', 'd9000000-0000-4000-8000-000000000001', 'online', array[q]) s;
  perform public.attach_payment_session(co, 'fake', ref);
  perform set_config('role', 'service_role', true);
  perform public.confirm_payment('fake', 'evt-' || ref, ref, due, null, '{}');
  perform set_config('role', 'authenticated', true);
  return pg_temp.last_order();
end $$;
-- The booking found the courier dearer by 3,000: the buyer pays a delivery top-up checkout (a second payment).
create function pg_temp.topped(p_order uuid) returns void language plpgsql as $$
declare c uuid; ref text := 'tp-' || gen_random_uuid();
begin
  -- The first payment is older than the top-up (the whole test runs in one transaction, so now() would tie).
  perform pg_temp.run_sql('update public.payments set paid_at = now() - interval ''1 hour'', created_at = now() - interval ''1 hour'' where checkout_id = (select checkout_id from public.orders where id = ''' || p_order || ''')');
  perform set_config('role', 'service_role', true);
  perform public.begin_courier_booking(p_order, 12000);
  perform set_config('role', 'authenticated', true);
  perform pg_temp.as_user(pg_temp.buyer());
  select s.checkout_id into c from public.start_shipping_topup_checkout(p_order, gen_random_uuid(), 'qrph') s;
  perform public.attach_payment_session(c, 'fake', ref);
  perform set_config('role', 'service_role', true);
  perform public.confirm_payment('fake', 'evt-' || ref, ref, 3000, null, '{}');
  perform set_config('role', 'authenticated', true);
end $$;
create function pg_temp.run_sql(p_sql text) returns void language plpgsql security definer as $$
begin execute p_sql; end $$;
-- A balance payment of p_amount on the order (a second paid checkout with order_id set), as a split order has.
create function pg_temp.balance(p_order uuid, p_amount bigint) returns void language plpgsql security definer as $$
declare c uuid;
begin
  insert into public.checkouts (buyer_id, status, method, total_centavos, idempotency_key, expires_at, order_id)
  values (pg_temp.buyer()::uuid, 'paid', 'qrph', p_amount, gen_random_uuid(), now() + interval '1 hour', p_order) returning id into c;
  insert into public.payments (checkout_id, method, amount_centavos, status, paid_at, provider, provider_ref)
  values (c, 'qrph', p_amount, 'paid', now() + interval '1 second', 'fake', 'bal-' || gen_random_uuid());
  update public.orders set paid_online_centavos = paid_online_centavos + p_amount, fees_centavos = fees_centavos + p_amount,
    total_centavos = total_centavos + p_amount where id = p_order;
end $$;
-- "refund/payment" amounts of an order's refund rows, smallest refund first.
create function pg_temp.refs(p_order uuid) returns text language sql as $$
  select pg_temp.val('select string_agg(r.amount_centavos || ''/'' || p.amount_centavos, '','' order by r.amount_centavos) from public.refunds r
    join public.payments p on p.id = r.payment_id where r.order_id = ''' || p_order || '''');
$$;
create function pg_temp.groups(p_order uuid) returns text language sql as $$
  select pg_temp.val('select count(distinct coalesce(group_id, id)) from public.refunds where order_id = ''' || p_order || '''');
$$;
create function pg_temp.o(p_order uuid, p_expr text) returns text language sql as $$
  select pg_temp.val('select ' || p_expr || ' from public.orders where id = ''' || p_order || '''');
$$;
-- Completes every pending refund of the order (the gateway said yes).
create function pg_temp.settle_all(p_order uuid) returns void language plpgsql security definer as $$
declare r uuid;
begin
  for r in select id from public.refunds where order_id = p_order and status = 'pending' order by created_at, id loop
    perform public.complete_refund(r, 'rf-' || r, true);
  end loop;
end $$;
create function pg_temp.ev(p_order uuid, p_claim uuid) returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object('path', p_order || '/claims/' || p_claim || '/photo.jpg', 'fileName', 'photo.jpg'))
$$;
create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated, service_role;
grant execute on all functions in schema pg_temp to authenticated, service_role;

-- ------------------------------------------------------------ cancel after a top-up: two payments, two refund rows
insert into ids select 'a', pg_temp.buyq();
select pg_temp.topped((select v from ids where k = 'a'));
select is(pg_temp.o((select v from ids where k = 'a'), 'paid_online_centavos'), '22000', 'paid 19,000 and topped up 3,000');
select pg_temp.as_user(pg_temp.buyer());
insert into ids select 'a_rid', public.cancel_order((select v from ids where k = 'a'), 'Changed my mind');
select is(pg_temp.refs((select v from ids where k = 'a')), '3000/3000,19000/19000', 'the refund splits: 3,000 on the top-up payment, 19,000 on the first payment');
select is(pg_temp.groups((select v from ids where k = 'a')), '1', 'both rows are one group');
select is(pg_temp.val('select group_id::text from public.refunds where id = ''' || (select v from ids where k = 'a_rid') || ''''), null, 'the returned id is the head (no group_id)');
select is(pg_temp.val('select amount_centavos from public.refunds where id = ''' || (select v from ids where k = 'a_rid') || ''''), '3000', 'the head is on the newest payment');
select is(pg_temp.val('select count(*) from public.refunds where group_id = ''' || (select v from ids where k = 'a_rid') || ''''), '1', 'the other part points at the head');
select is(pg_temp.val('select count(distinct idempotency_key) from public.refunds where order_id = ''' || (select v from ids where k = 'a') || ''''), '2', 'each row has its own idempotency key');
select pg_temp.settle_all((select v from ids where k = 'a'));
select is(pg_temp.val('select count(*) from public.ledger_entries l join public.refunds r on r.id = l.refund_id
  where r.order_id = ''' || (select v from ids where k = 'a') || ''' and l.payment_id is distinct from r.payment_id'), '0', 'every refund ledger line carries its own payment_id');
select is(pg_temp.val('select count(distinct payment_id) from public.ledger_entries where account = ''gateway_clearing'' and debit_centavos > 0 and order_id = '''
  || (select v from ids where k = 'a') || ''''), '2', 'the gateway-clearing refund lines are on two payments');
select is(pg_temp.val('select count(*) from (select txn_id from public.ledger_entries group by txn_id having sum(debit_centavos) <> sum(credit_centavos)) x'), '0',
  'every ledger txn balances');
-- Each row prorates commission with integer division, so a split refund can leave at most 1 centavo per extra row unreturned.
select ok(pg_temp.val('select coalesce(sum(debit_centavos), 0) from public.ledger_entries where account = ''platform_revenue'' and refund_id is not null and order_id = '''
  || (select v from ids where k = 'a') || '''')::bigint between pg_temp.o((select v from ids where k = 'a'), 'commission_centavos')::bigint - 1
  and pg_temp.o((select v from ids where k = 'a'), 'commission_centavos')::bigint, 'the per-row commission returned adds up to the order commission (within a centavo)');

-- ------------------------------------------------------------ split order (downpayment + balance), cancelled
insert into ids select 'b', pg_temp.buyq();
select pg_temp.balance((select v from ids where k = 'b'), 5000);
select pg_temp.as_user(pg_temp.buyer());
select lives_ok($$ select public.cancel_order((select v from ids where k = 'b'), 'x') $$, 'a split order is cancelled');
select is(pg_temp.refs((select v from ids where k = 'b')), '5000/5000,19000/19000', 'the balance is refunded to the balance payment, the downpayment to the first');
select is(pg_temp.groups((select v from ids where k = 'b')), '1', 'one group');

-- ------------------------------------------------------------ returned parcel on a split order
insert into ids select 'c', pg_temp.buyq();
select pg_temp.balance((select v from ids where k = 'c'), 5000);
set local role service_role;
select lives_ok($$ select public.begin_courier_booking((select v from ids where k = 'c'), 9000) $$, 'booking claimed');
select lives_ok($$ select public.record_shipment((select v from ids where k = 'c'), 'fake', 'RS-RET', 9000, null) $$, 'booked at the paid price');
select ok(public.record_tracking_event('fake', 'rs-ret-1', 'RS-RET', 'returned', now(), 'Refused', null, '{}') like 'refund:%', 'the parcel comes back and a refund is created');
select is(pg_temp.refs((select v from ids where k = 'c')), '5000/5000,19000/19000', 'the returned-parcel refund is split across both payments');
select is(pg_temp.groups((select v from ids where k = 'c')), '1', 'one group');

-- ------------------------------------------------------------ a claim refund larger than the newest payment
reset role;
create function pg_temp.claim_order() returns uuid language plpgsql as $$
declare o uuid;
begin
  o := pg_temp.buyq();
  perform pg_temp.topped(o);
  perform pg_temp.run_sql('update public.orders set status = ''delivered'', delivered_at = now() where id = ''' || o || '''');
  return o;
end $$;
grant execute on function pg_temp.claim_order() to authenticated, service_role;
set local role authenticated;
insert into ids select 'd', pg_temp.claim_order();
insert into ids values ('d_claim', 'dc000000-0000-4000-8000-000000000001');
select pg_temp.as_user(pg_temp.buyer());
select lives_ok($$ select public.open_claim((select v from ids where k = 'd_claim'), (select v from ids where k = 'd'), 'damage', '{}',
  'Box arrived crushed on one side', pg_temp.ev((select v from ids where k = 'd'), (select v from ids where k = 'd_claim'))) $$, 'buyer opens a claim');
select pg_temp.as_user('d6000000-0000-4000-8000-000000000002');
select lives_ok($$ select public.respond_claim((select v from ids where k = 'd_claim'), true, 'refund', 22000, false, 'Sorry') $$, 'supplier accepts a refund of the whole order');
select is(pg_temp.refs((select v from ids where k = 'd')), '3000/3000,19000/19000', 'the claim refund splits across the two payments');
select is(pg_temp.val('select (online_refund_id = (select id from public.refunds where order_id = ''' || (select v from ids where k = 'd') || ''' and group_id is null))::text
  from public.claims where id = ''' || (select v from ids where k = 'd_claim') || ''''), 'true', 'the claim points at the group head');
select is(pg_temp.val('select status::text from public.claims where id = ''' || (select v from ids where k = 'd_claim') || ''''), 'refund_pending', 'the claim waits for the gateway');
reset role;
select public.complete_refund((select online_refund_id from public.claims where id = (select v from ids where k = 'd_claim')), 'rf-d-head', true);
select is(pg_temp.val('select status::text from public.claims where id = ''' || (select v from ids where k = 'd_claim') || ''''), 'refund_pending',
  'one part succeeded: the claim is still open');
select pg_temp.settle_all((select v from ids where k = 'd'));
select is(pg_temp.val('select status::text from public.claims where id = ''' || (select v from ids where k = 'd_claim') || ''''), 'resolved', 'the claim resolves after the last part succeeds');

-- ------------------------------------------------------------ a failed part, reissued
set local role authenticated;
insert into ids select 'e', pg_temp.claim_order();
insert into ids values ('e_claim', 'dc000000-0000-4000-8000-000000000002');
select pg_temp.as_user(pg_temp.buyer());
select lives_ok($$ select public.open_claim((select v from ids where k = 'e_claim'), (select v from ids where k = 'e'), 'damage', '{}',
  'Box arrived crushed on one side', pg_temp.ev((select v from ids where k = 'e'), (select v from ids where k = 'e_claim'))) $$, 'second claim opened');
select pg_temp.as_user('d6000000-0000-4000-8000-000000000002');
select lives_ok($$ select public.respond_claim((select v from ids where k = 'e_claim'), true, 'refund', 22000, false, 'Sorry') $$, 'accepted');
reset role;
select public.complete_refund((select online_refund_id from public.claims where id = (select v from ids where k = 'e_claim')), 'rf-e-head', true);
insert into ids select 'e_part', id from public.refunds where order_id = (select v from ids where k = 'e') and group_id is not null;
select public.complete_refund((select v from ids where k = 'e_part'), null, false);
select is(pg_temp.val('select status::text from public.claims where id = ''' || (select v from ids where k = 'e_claim') || ''''), 'refund_pending',
  'a failed part that nobody reissued keeps the claim open');
set local role authenticated;
select pg_temp.as_user('d6000000-0000-4000-8000-000000000005', 'aal2');
insert into ids select 'e_new', public.admin_reissue_refund((select v from ids where k = 'e_part'), gen_random_uuid());
reset role;
select is(pg_temp.val('select (group_id = (select online_refund_id from public.claims where id = ''' || (select v from ids where k = 'e_claim') || ''') and reissue_of = '''
  || (select v from ids where k = 'e_part') || ''' and payment_id = (select payment_id from public.refunds where id = ''' || (select v from ids where k = 'e_part')
  || ''') and amount_centavos = 19000)::text from public.refunds where id = ''' || (select v from ids where k = 'e_new') || ''''), 'true',
  'the reissue joins the group, points at the failed part, and keeps its payment and amount');
select is(pg_temp.val('select (online_refund_id = (select id from public.refunds where order_id = ''' || (select v from ids where k = 'e') || ''' and group_id is null))::text
  from public.claims where id = ''' || (select v from ids where k = 'e_claim') || ''''), 'true', 'the claim stays on the group head');
select is(pg_temp.val('select status::text from public.claims where id = ''' || (select v from ids where k = 'e_claim') || ''''), 'refund_pending', 'a pending reissue keeps the claim open');
select public.complete_refund((select v from ids where k = 'e_new'), 'rf-e-new', true);
select is(pg_temp.val('select status::text from public.claims where id = ''' || (select v from ids where k = 'e_claim') || ''''), 'resolved', 'the claim resolves after the reissue succeeds');

-- ------------------------------------------------------------ delivery excess goes against the newest payment first
set local role authenticated;
insert into ids select 'f', pg_temp.buyq();
select pg_temp.topped((select v from ids where k = 'f'));
set local role service_role;
select lives_ok($$ select public.begin_courier_booking((select v from ids where k = 'f'), 12000) $$, 'booking after the top-up');
select lives_ok($$ select public.record_shipment((select v from ids where k = 'f'), 'fake', 'RS-EX', 11500, null) $$, 'booked 500 under what was held');
insert into ids select 'f_rid', public.refund_shipping_excess((select v from ids where k = 'f'));
select is(pg_temp.refs((select v from ids where k = 'f')), '500/3000', 'the 500 excess is refunded against the top-up payment, the newest');
select is(pg_temp.val('select shipping_adjustment::text from public.refunds where id = ''' || (select v from ids where k = 'f_rid') || ''''), 'true', 'it is a delivery adjustment');

-- ------------------------------------------------------------ finance refund on a topped-up order, same key twice
set local role authenticated;
insert into ids select 'h', pg_temp.buyq();
select pg_temp.topped((select v from ids where k = 'h'));
select pg_temp.as_user('d6000000-0000-4000-8000-000000000005', 'aal2');
insert into ids select 'h_rid', public.admin_create_refund((select v from ids where k = 'h'), 21000, 'Partial refund', 'dd000000-0000-4000-8000-000000000001');
select is(pg_temp.refs((select v from ids where k = 'h')), '3000/3000,18000/19000', 'a finance refund of 21,000 is split 3,000 + 18,000');
select is(public.admin_create_refund((select v from ids where k = 'h'), 21000, 'Partial refund', 'dd000000-0000-4000-8000-000000000001'),
  (select v from ids where k = 'h_rid'), 'the same key returns the head');
select is(pg_temp.val('select count(*) from public.refunds where order_id = ''' || (select v from ids where k = 'h') || ''''), '2', 'and creates no more rows');
select throws_ok($$ select public.admin_create_refund((select v from ids where k = 'h'), 1001, 'Too much', gen_random_uuid()) $$, '22023', null,
  'the per-order cap still applies');

-- ------------------------------------------------------------ one cart payment shared by two orders
reset role;
set local role authenticated;
select pg_temp.as_user(pg_temp.buyer());
delete from public.cart_items;
insert into public.cart_items (product_id, quantity) values ('d8000000-0000-4000-8000-000000000001', 1), ('d8000000-0000-4000-8000-000000000002', 1);
create temp table cart (co uuid, due bigint);
grant all on cart to authenticated, service_role;
insert into cart select s.checkout_id, s.amount_centavos from public.start_checkout(gen_random_uuid(), 'qrph', 'd9000000-0000-4000-8000-000000000001', 'online') s;
select public.attach_payment_session((select co from cart), 'fake', 'ref-cart');
set local role service_role;
select is(public.confirm_payment('fake', 'evt-cart', 'ref-cart', (select due from cart), null, '{}'), 'paid', 'one payment for a two-supplier cart');
set local role authenticated;
select pg_temp.as_user(pg_temp.buyer());
insert into ids select 'g1', id from public.orders where checkout_id = (select co from cart) and supplier_id = 'd7000000-0000-4000-8000-000000000001';
insert into ids select 'g2', id from public.orders where checkout_id = (select co from cart) and supplier_id = 'd7000000-0000-4000-8000-000000000002';
select lives_ok($$ select public.cancel_order((select v from ids where k = 'g1'), 'x') $$, 'the first order of the cart is cancelled');
reset role;
select is(pg_temp.val('select (select sum(amount_centavos) from public.refunds where payment_id = (select id from public.payments where checkout_id = (select co from cart)))
  <= (select amount_centavos from public.payments where checkout_id = (select co from cart))'), 'true', 'refunds on the cart payment stay within it');
select throws_ok($$ select private.create_order_refund((select o from public.orders o where o.id = (select v from ids where k = 'g2')),
  (select paid_online_centavos + 1 from public.orders where id = (select v from ids where k = 'g2')), 'Too much', null) $$, '22023', null,
  'the second order cannot take more than what is left on the shared payment');
select throws_ok($$ insert into public.refunds (order_id, payment_id, amount_centavos, reason, idempotency_key)
  select o.id, p.id, o.paid_online_centavos + 1, 'Too much', gen_random_uuid() from public.orders o join public.payments p on p.checkout_id = o.checkout_id
  where o.id = (select v from ids where k = 'g1') $$, '22023', null, 'guard_refund_total still caps a refund per order');
select is(pg_temp.val('select count(*) from public.refunds where order_id = ''' || (select v from ids where k = 'g2') || ''''), '0', 'the refused refund inserted nothing');

select * from finish();
rollback;
