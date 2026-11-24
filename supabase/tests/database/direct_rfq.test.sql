-- Product-specific RFQs: go to the supplier's private chat as a card, never to public.rfqs or the board.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

insert into auth.users (id, email, raw_user_meta_data) values
  ('ad000000-0000-4000-8000-000000000001', 'dr-buyer@test.ph', '{"role":"buyer"}'),
  ('ad000000-0000-4000-8000-000000000002', 'dr-owner@test.ph', '{"role":"supplier"}'),
  ('ad000000-0000-4000-8000-000000000003', 'dr-other@test.ph', '{"role":"buyer"}'),
  ('ad000000-0000-4000-8000-000000000004', 'dr-owner2@test.ph', '{"role":"supplier"}');
update public.profiles set business_name = 'Buyer Trading Co' where id = 'ad000000-0000-4000-8000-000000000001';

insert into public.suppliers (id, owner_id, business_name, legal_name, category_id, city, province, moq, lead_days, description, status)
select v.id::uuid, v.owner::uuid, v.name, v.name, (select id from public.categories limit 1), 'Manila', 'Metro Manila', 1, 1, 'Test', 'verified'
from (values
  ('ae000000-0000-4000-8000-000000000001', 'ad000000-0000-4000-8000-000000000002', 'Shirt Prints'),
  ('ae000000-0000-4000-8000-000000000002', 'ad000000-0000-4000-8000-000000000004', 'Mug Prints')
) as v(id, owner, name);

insert into public.products (id, supplier_id, category_id, title, description, moq, unit, return_class, status, idempotency_key)
select v.id::uuid, v.sup::uuid, (select id from public.categories limit 1), v.title, 'Test', 10, 'pcs', 'custom', v.status::public.product_status, gen_random_uuid()
from (values
  ('af000000-0000-4000-8000-000000000001', 'ae000000-0000-4000-8000-000000000001', 'Printed Shirt', 'approved'),
  ('af000000-0000-4000-8000-000000000002', 'ae000000-0000-4000-8000-000000000002', 'Printed Mug', 'approved'),
  ('af000000-0000-4000-8000-000000000003', 'ae000000-0000-4000-8000-000000000001', 'Draft Hoodie', 'draft')
) as v(id, sup, title, status);

create function pg_temp.as_user(p_id text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated', 'aal', 'aal1')::text, true);
$$;
grant execute on function pg_temp.as_user(text) to authenticated;

-- send_direct_rfq(supplier, product, name, type, qty, unit, target, specs, city, province, required_by, notes, key)
create function pg_temp.rfq(p_supplier text, p_product text, p_qty integer, p_by date, p_key text) returns uuid language sql as $$
  select public.send_direct_rfq(p_supplier::uuid, p_product::uuid, 'ignored', 'Round neck', p_qty, 'pcs', 12000,
    'Cotton, full colour', 'Las Piñas', 'Metro Manila', p_by, 'Sizes S to XL', p_key::uuid);
$$;
grant execute on function pg_temp.rfq(text, text, integer, date, text) to authenticated;
set local role authenticated;

select pg_temp.as_user('ad000000-0000-4000-8000-000000000001');
select lives_ok($$ select pg_temp.rfq('ae000000-0000-4000-8000-000000000001', 'af000000-0000-4000-8000-000000000001', 50, null,
  'b1000000-0000-4000-8000-000000000001') $$, 'a buyer sends an RFQ about a live listing');
select lives_ok($$ select pg_temp.rfq('ae000000-0000-4000-8000-000000000001', 'af000000-0000-4000-8000-000000000001', 50, null,
  'b1000000-0000-4000-8000-000000000001') $$, 'a retry with the same key succeeds');
select is((select count(*)::int from public.direct_messages where kind = 'rfq'), 1, 'the retry stores no second RFQ');
select is((select payload ->> 'productName' from public.direct_messages where kind = 'rfq'), 'Printed Shirt',
  'the product name comes from the listing, not the caller');
select is((select (payload ->> 'targetPriceCentavos')::bigint from public.direct_messages where kind = 'rfq'), 12000::bigint,
  'the target price is stored in centavos');
select is((select product_id from public.direct_messages where kind = 'rfq'), 'af000000-0000-4000-8000-000000000001'::uuid,
  'the message keeps the product context');
select is((select count(*)::int from public.rfqs where buyer_id = auth.uid()), 0, 'no public request is created');

select throws_ok($$ select pg_temp.rfq('ae000000-0000-4000-8000-000000000001', 'af000000-0000-4000-8000-000000000002', 50, null,
  'b1000000-0000-4000-8000-000000000002') $$, '22023', null, 'a listing of another supplier is refused');
select throws_ok($$ select pg_temp.rfq('ae000000-0000-4000-8000-000000000001', 'af000000-0000-4000-8000-000000000003', 50, null,
  'b1000000-0000-4000-8000-000000000003') $$, '22023', null, 'a listing that is not live is refused');
select throws_ok($$ select pg_temp.rfq('ae000000-0000-4000-8000-000000000001', 'af000000-0000-4000-8000-000000000001', 0, null,
  'b1000000-0000-4000-8000-000000000004') $$, '22023', null, 'a zero quantity is refused');
select throws_ok($$ select pg_temp.rfq('ae000000-0000-4000-8000-000000000001', 'af000000-0000-4000-8000-000000000001', 5, current_date - 2,
  'b1000000-0000-4000-8000-000000000005') $$, '22023', null, 'a past delivery date is refused');
select lives_ok($$ select public.send_direct_rfq('ae000000-0000-4000-8000-000000000002', null, 'Custom tumblers', '', 20, 'pcs', null,
  '', 'Las Piñas', 'Metro Manila', null, '', 'b1000000-0000-4000-8000-000000000006') $$,
  'an RFQ can name its product when it is not about a listing');

-- The supplier sees the RFQ; another buyer does not.
select pg_temp.as_user('ad000000-0000-4000-8000-000000000002');
select is((select count(*)::int from public.direct_messages where kind = 'rfq'), 1, 'the supplier sees the RFQ sent to them');
select throws_ok($$ select pg_temp.rfq('ae000000-0000-4000-8000-000000000001', 'af000000-0000-4000-8000-000000000001', 5, null,
  'b1000000-0000-4000-8000-000000000007') $$, '22023', null, 'a supplier cannot send an RFQ to their own business');
select pg_temp.as_user('ad000000-0000-4000-8000-000000000003');
select is((select count(*)::int from public.direct_messages where kind = 'rfq'), 0, 'another buyer sees no RFQ');

reset role;
select is((select link from public.notifications where user_id = 'ad000000-0000-4000-8000-000000000002' order by id desc limit 1),
  '/messages?c=' || (select id from public.direct_conversations where buyer_id = 'ad000000-0000-4000-8000-000000000001'
    and supplier_id = 'ae000000-0000-4000-8000-000000000001'),
  'the supplier is notified with a link to the chat');

select * from finish();
rollback;
