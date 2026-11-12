-- Stage 4 money: cart, checkout, stock, payment webhook, ledger, refunds, payouts, expiry.
begin;
create extension if not exists pgtap with schema extensions;
select plan(50);

-- Hide local seed data (supabase/seed.sql) so counts only see this file's fixtures; rolled back at the end.
update public.suppliers set status = 'suspended';

insert into auth.users (id, email, raw_user_meta_data) values
  ('e1000000-0000-4000-8000-000000000001', 'mb@test.ph', '{"role":"buyer"}'),
  ('e1000000-0000-4000-8000-000000000002', 'ms1@test.ph', '{"role":"supplier"}'),
  ('e1000000-0000-4000-8000-000000000003', 'ms2@test.ph', '{"role":"supplier"}'),
  ('e1000000-0000-4000-8000-000000000004', 'mf@test.ph', '{}'),
  ('e1000000-0000-4000-8000-000000000005', 'mo@test.ph', '{"role":"buyer"}');
update public.profiles set role = 'admin' where id = 'e1000000-0000-4000-8000-000000000004';
insert into public.admin_roles (user_id, sub_role) values ('e1000000-0000-4000-8000-000000000004', 'finance');
insert into public.suppliers (id, owner_id, business_name, legal_name, category_id, city, province, moq, lead_days, description, status)
select v.id, v.owner, v.name, v.name, (select id from public.categories where slug = 'custom-shirts'), 'Pasig', 'Metro Manila', 1, 7, 'x', 'verified'
from (values
  ('e2000000-0000-4000-8000-000000000001'::uuid, 'e1000000-0000-4000-8000-000000000002'::uuid, 'Shirts Co'),
  ('e2000000-0000-4000-8000-000000000002'::uuid, 'e1000000-0000-4000-8000-000000000003'::uuid, 'Boxes Co')
) as v (id, owner, name);
-- P1: shirts, MOQ 10, PHP 100, tier 50+ = PHP 90, options M (stock 100) and L (+PHP 5, stock 12).
-- P2: boxes, MOQ 1, PHP 25, stock 3.  P3: price on request.
insert into public.products (id, supplier_id, category_id, title, description, moq, unit, indicative_price_centavos, return_class, status, idempotency_key, stock)
select v.id, v.sup, (select id from public.categories where slug = 'custom-shirts'), v.title, 'x', v.moq, 'pcs', v.price, 'standard', 'approved', gen_random_uuid(), v.stock
from (values
  ('e3000000-0000-4000-8000-000000000001'::uuid, 'e2000000-0000-4000-8000-000000000001'::uuid, 'Shirt', 10, 10000::bigint, null::integer),
  ('e3000000-0000-4000-8000-000000000002'::uuid, 'e2000000-0000-4000-8000-000000000002'::uuid, 'Box', 1, 2500::bigint, 3),
  ('e3000000-0000-4000-8000-000000000003'::uuid, 'e2000000-0000-4000-8000-000000000002'::uuid, 'Custom box', 1, null::bigint, null::integer)
) as v (id, sup, title, moq, price, stock);
insert into public.price_tiers (product_id, min_qty, unit_price_centavos) values ('e3000000-0000-4000-8000-000000000001', 50, 9000);
insert into public.product_variants (id, product_id, name, price_delta_centavos, stock) values
  ('e4000000-0000-4000-8000-000000000001', 'e3000000-0000-4000-8000-000000000001', 'M', 0, 100),
  ('e4000000-0000-4000-8000-000000000002', 'e3000000-0000-4000-8000-000000000001', 'L', 500, 12);

create function pg_temp.as_user(p_id text, p_aal text default 'aal1') returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated', 'aal', p_aal)::text, true);
$$;
create function pg_temp.order_of(p_supplier text) returns uuid language sql as $$
  select id from public.orders where supplier_id = p_supplier::uuid and status <> 'cancelled' or (supplier_id = p_supplier::uuid and checkout_id in (select id from public.checkouts where status = 'paid')) order by created_at limit 1
$$;
create function pg_temp.payable(p_supplier text) returns bigint language sql as $$
  select coalesce(sum(credit_centavos - debit_centavos), 0)::bigint from public.ledger_entries
  where account = 'supplier_payable' and supplier_id = p_supplier::uuid
$$;
create function pg_temp.balanced() returns boolean language sql as $$
  select coalesce(bool_and(d = c), true) from (
    select txn_id, sum(debit_centavos) d, sum(credit_centavos) c from public.ledger_entries group by txn_id) t
$$;
grant execute on all functions in schema pg_temp to authenticated, service_role;
set local role authenticated;

-- ------------------------------------------------------------ cart rules
select pg_temp.as_user('e1000000-0000-4000-8000-000000000001');
select lives_ok($$ insert into public.cart_items (product_id, variant_id, quantity) values
  ('e3000000-0000-4000-8000-000000000001', null, 10) $$, 'buyer adds to cart');
select throws_ok($$ select * from public.start_checkout(gen_random_uuid(), 'ewallet') $$, '22023', null, 'an option must be picked');
delete from public.cart_items;
insert into public.cart_items (product_id, variant_id, quantity) values ('e3000000-0000-4000-8000-000000000001', 'e4000000-0000-4000-8000-000000000001', 5);
select throws_ok($$ select * from public.start_checkout(gen_random_uuid(), 'ewallet') $$, '22023', null, 'MOQ enforced');
update public.cart_items set quantity = 50;
insert into public.cart_items (product_id, variant_id, quantity) values ('e3000000-0000-4000-8000-000000000001', 'e4000000-0000-4000-8000-000000000002', 15);
select throws_ok($$ select * from public.start_checkout(gen_random_uuid(), 'ewallet') $$, '22023', null, 'not enough stock');
select is((select stock from public.product_variants where name = 'L'), 12, 'failed checkout reserved nothing');
update public.cart_items set quantity = 10 where variant_id = 'e4000000-0000-4000-8000-000000000002';
insert into public.cart_items (product_id, quantity) values ('e3000000-0000-4000-8000-000000000003', 1);
select throws_ok($$ select * from public.start_checkout(gen_random_uuid(), 'ewallet') $$, '22023', null, 'price-on-request items need an RFQ');
delete from public.cart_items where product_id = 'e3000000-0000-4000-8000-000000000003';
insert into public.cart_items (product_id, quantity) values ('e3000000-0000-4000-8000-000000000002', 2);

select pg_temp.as_user('e1000000-0000-4000-8000-000000000005');
select is((select count(*)::int from public.cart_items), 0, 'others cannot see the cart');

-- ------------------------------------------------------------ checkout
select pg_temp.as_user('e1000000-0000-4000-8000-000000000001');
select is((select amount_centavos from public.start_checkout('e5000000-0000-4000-8000-000000000001', 'ewallet')), 560000::bigint,
  '50 x 90.00 (tier) + 10 x 105.00 (L) + 2 x 25.00 = 5,600.00');
select is((select amount_centavos from public.start_checkout('e5000000-0000-4000-8000-000000000001', 'ewallet')), 560000::bigint, 'retry returns the same checkout');
select is((select count(*)::int from public.checkouts), 1, 'one checkout');
select is((select count(*)::int from public.orders), 2, 'one order per supplier');
select is((select total_centavos from public.orders where supplier_id = 'e2000000-0000-4000-8000-000000000001'), 555000::bigint, 'shirts order total');
select is((select array_agg(stock order by name) from public.product_variants), array[2, 50], 'option stock reserved (L, M)');
select is((select stock from public.products where title = 'Box'), 1, 'product stock reserved');
select throws_ok($$ select public.confirm_payment('fake', 'x', 'x', 1, null, '{}') $$, '42501', null, 'buyers cannot confirm payments');
select lives_ok($$ select public.attach_payment_session((select id from public.checkouts), 'fake', 'ref-1') $$, 'payment session attached');

select pg_temp.as_user('e1000000-0000-4000-8000-000000000002');
select is((select count(*)::int from public.orders), 0, 'supplier cannot see an unpaid order');

-- ------------------------------------------------------------ webhook
reset role;
set local role service_role;
select is(public.confirm_payment('fake', 'evt-1', 'ref-1', 560000, null, '{}'), 'paid', 'gateway confirms the payment');
select is(public.confirm_payment('fake', 'evt-1', 'ref-1', 560000, null, '{}'), 'duplicate', 'same webhook twice changes nothing');
reset role;
select is((select fee_centavos from public.payments), 14000::bigint, 'e-wallet fee 2.5% from admin settings');
select is((select sum(gateway_fee_centavos)::bigint from public.orders), 14000::bigint, 'fee fully split across orders');
select is((select gateway_fee_centavos from public.orders where supplier_id = 'e2000000-0000-4000-8000-000000000001'), 13875::bigint, 'fee split by order total');
select ok(pg_temp.balanced(), 'every ledger transaction balances');
select is(pg_temp.payable('e2000000-0000-4000-8000-000000000001'), 541125::bigint, 'shirts supplier owed total - commission (0%) - fee');
select is((select count(*)::int from public.orders where status = 'paid'), 2, 'orders paid');
select is((select count(*)::int from public.cart_items), 0, 'cart emptied');

reset role;
set local role authenticated;
select pg_temp.as_user('e1000000-0000-4000-8000-000000000002');
select is((select count(*)::int from public.orders), 1, 'supplier sees its paid order only');
select is((select count(*)::int from public.profiles where id = 'e1000000-0000-4000-8000-000000000001'), 1, 'and who the buyer is');

-- ------------------------------------------------------------ buyer cancels the boxes order
select pg_temp.as_user('e1000000-0000-4000-8000-000000000001');
select lives_ok($$ select public.cancel_order((select id from public.orders where supplier_id = 'e2000000-0000-4000-8000-000000000002')) $$,
  'buyer cancels a paid order before production');
select is((select stock from public.products where title = 'Box'), 3, 'stock returned');
reset role;
-- service_role may only call the settle functions (no table access), so look ids up first.
create temp table t_ref as select id from public.refunds;
grant select on t_ref to service_role;
set local role service_role;
select lives_ok($$ select public.complete_refund((select id from t_ref), 'rf-1', true) $$, 'gateway confirms the refund');
reset role;
select is(pg_temp.payable('e2000000-0000-4000-8000-000000000002'), -125::bigint, 'the supplier still bears the gateway fee');
select ok(pg_temp.balanced(), 'ledger still balances after the refund');

-- ------------------------------------------------------------ finance refund and payout
reset role;
set local role authenticated;
select pg_temp.as_user('e1000000-0000-4000-8000-000000000004', 'aal2');
select throws_ok($$ select public.admin_create_refund((select id from public.orders where supplier_id = 'e2000000-0000-4000-8000-000000000001'),
  555001, 'Too much', gen_random_uuid()) $$, '22023', null, 'cannot refund more than was paid');
select lives_ok($$ select public.admin_create_refund((select id from public.orders where supplier_id = 'e2000000-0000-4000-8000-000000000001'),
  100000, 'Two shirts misprinted', 'e6000000-0000-4000-8000-000000000001') $$, 'finance refunds part of an order');
reset role;
create temp table t_ref2 as select id from public.refunds where idempotency_key = 'e6000000-0000-4000-8000-000000000001';
grant select on t_ref2 to service_role;
set local role service_role;
select lives_ok($$ select public.complete_refund((select id from t_ref2), 'rf-2', true) $$,
  'partial refund settled');

reset role;
update public.orders set status = 'delivered', delivered_at = now() - interval '8 days' where supplier_id = 'e2000000-0000-4000-8000-000000000001';
select is(private.schedule_payouts(), 1, 'one payout scheduled (the cancelled order owes only a fee)');
select is((select amount_centavos from public.payouts), 441125::bigint, 'payout = what is owed after the refund');
set local role authenticated;
select pg_temp.as_user('e1000000-0000-4000-8000-000000000004', 'aal2');
select lives_ok($$ select public.admin_release_payout((select id from public.payouts), 'manual-1') $$, 'finance releases the payout');
select throws_ok($$ select public.admin_release_payout((select id from public.payouts), '') $$, '22023', null, 'a payout is released once');

-- ------------------------------------------------------------ supplier options and stock
select pg_temp.as_user('e1000000-0000-4000-8000-000000000003');
select throws_ok($$ select public.set_stock('e3000000-0000-4000-8000-000000000002', null, -1) $$, '22023', null, 'stock cannot be negative');
select throws_ok($$ select public.set_stock('e3000000-0000-4000-8000-000000000001', null, 5) $$, 'P0002', null, 'only the owner sets stock');
select pg_temp.as_user('e1000000-0000-4000-8000-000000000002');
select lives_ok($$ select public.set_product_variants('e3000000-0000-4000-8000-000000000001', '[{"name": "XL", "priceDeltaCentavos": 1000}]') $$, 'owner replaces options');
select is((select status::text from public.products where id = 'e3000000-0000-4000-8000-000000000001'), 'pending', 'changing options re-opens review');
reset role;
update public.products set status = 'approved';
set local role authenticated;

-- ------------------------------------------------------------ expiry and a late payment
select pg_temp.as_user('e1000000-0000-4000-8000-000000000001');
insert into public.cart_items (product_id, quantity) values ('e3000000-0000-4000-8000-000000000002', 1);
select is((select amount_centavos from public.start_checkout(gen_random_uuid(), 'card')), 2500::bigint, 'second checkout');
select public.attach_payment_session((select id from public.checkouts where status = 'pending'), 'fake', 'ref-2');
reset role;
update public.checkouts set expires_at = now() - interval '1 minute' where status = 'pending';
select is(private.expire_checkouts(), 1, 'unpaid checkout expires');
select is((select stock from public.products where title = 'Box'), 3, 'expired checkout returned its stock');
set local role service_role;
select is(public.confirm_payment('fake', 'evt-2', 'ref-2', 2500, null, '{}'), 'needs_review', 'late payment parked for review');

reset role;
select ok(pg_temp.balanced(), 'ledger balances at the end');
select throws_ok($$ delete from public.ledger_entries $$, '42501', null, 'ledger is append-only');

select * from finish();
rollback;
