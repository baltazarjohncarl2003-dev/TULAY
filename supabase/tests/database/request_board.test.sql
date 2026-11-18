-- Public request board: who sees what, who may respond, idempotency, and when a request leaves the board.
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

-- Hide local seed data so counts only see this file's fixtures; rolled back at the end.
update public.suppliers set status = 'suspended';

-- Buyer B (also owns verified supplier BS), buyer B2, verified supplier S1, pending supplier S3, support admin.
insert into auth.users (id, email, raw_user_meta_data) values
  ('b1000000-0000-4000-8000-000000000001', 'bb@test.ph', '{"role":"buyer"}'),
  ('b1000000-0000-4000-8000-000000000002', 'bb2@test.ph', '{"role":"buyer"}'),
  ('b1000000-0000-4000-8000-000000000003', 'bs1@test.ph', '{"role":"supplier"}'),
  ('b1000000-0000-4000-8000-000000000004', 'bs3@test.ph', '{"role":"supplier"}'),
  ('b1000000-0000-4000-8000-000000000005', 'badm@test.ph', '{}');
update public.profiles set role = 'admin' where id = 'b1000000-0000-4000-8000-000000000005';
insert into public.admin_roles (user_id, sub_role) values ('b1000000-0000-4000-8000-000000000005', 'support');
-- auto_invites off everywhere so approval does not invite anyone by itself.
insert into public.suppliers (id, owner_id, business_name, legal_name, category_id, city, province, moq, lead_days, description,
  status, delivery_areas, auto_invites)
select v.id, v.owner, v.name, v.name, (select id from public.categories where slug = 'custom-shirts'), 'Pasig', 'Metro Manila',
  10, 7, 'x', v.status::public.supplier_status, '{"Metro Manila"}', false
from (values
  ('b2000000-0000-4000-8000-000000000001'::uuid, 'b1000000-0000-4000-8000-000000000003'::uuid, 'S1 Prints', 'verified'),
  ('b2000000-0000-4000-8000-000000000003'::uuid, 'b1000000-0000-4000-8000-000000000004'::uuid, 'S3 Pending', 'pending'),
  ('b2000000-0000-4000-8000-000000000002'::uuid, 'b1000000-0000-4000-8000-000000000001'::uuid, 'Buyer Own Prints', 'verified')
) as v (id, owner, name, status);

create function pg_temp.as_user(p_id text, p_aal text default 'aal1') returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated', 'aal', p_aal)::text, true);
$$;
create function pg_temp.as_anon() returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
$$;
create function pg_temp.rfq(p text) returns uuid language sql security definer as $$
  select id from public.rfqs where product = p
$$;
grant execute on function pg_temp.as_user(text, text), pg_temp.as_anon(), pg_temp.rfq(text) to authenticated, anon;
set local role authenticated;

-- ------------------------------------------------------------ buyer posts, admin approves
select pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
select public.save_rfq(null, 'f1000000-0000-4000-8000-000000000001', 'Board shirts', 'custom-shirts', 'Logo shirts for staff',
  'Cotton 180gsm', 40, 'pcs', 'Quezon City', 'Metro Manila', current_date + 30, 1400000, true, 'any', true, true);
select public.save_rfq(null, 'f1000000-0000-4000-8000-000000000002', 'Draft mugs', 'custom-shirts', 'Mugs', 'White', 10, 'pcs',
  'Quezon City', 'Metro Manila', current_date + 30, null, true, 'any', false, false);
select lives_ok($$ select public.set_rfq_board(pg_temp.rfq('Board shirts'), true) $$, 'buyer puts a request on the board');
select lives_ok($$ select public.set_rfq_board(pg_temp.rfq('Board shirts'), true) $$, 'setting it again is a no-op');
select lives_ok($$ select public.set_rfq_board(pg_temp.rfq('Draft mugs'), true) $$, 'a draft can be flagged too');

select pg_temp.as_user('b1000000-0000-4000-8000-000000000002');
select throws_ok($$ select public.set_rfq_board(pg_temp.rfq('Board shirts'), false) $$, 'P0002', null,
  'another buyer cannot change it');

set local role anon;
select pg_temp.as_anon();
select is((select count(*)::int from public.list_board_requests()), 0, 'nothing shows before TULAY approves');

set local role authenticated;
select pg_temp.as_user('b1000000-0000-4000-8000-000000000005', 'aal2');
select public.admin_review_rfq(pg_temp.rfq('Board shirts'), 'approve');

-- ------------------------------------------------------------ anyone can read the board, safely
set local role anon;
select pg_temp.as_anon();
select is((select count(*)::int from public.list_board_requests()), 1, 'signed-out visitors see the approved request only');
select is((select product from public.list_board_requests()), 'Board shirts', 'it is the approved one, not the draft');
select is((select already_responded from public.list_board_requests()), null, 'signed out: no responded flag');
select throws_ok($$ select buyer_id from public.list_board_requests() $$, '42703', null, 'no buyer identity column');
select throws_ok($$ select budget_centavos from public.list_board_requests() $$, '42703', null, 'no budget column');
select throws_ok($$ select public.respond_to_board_request(pg_temp.rfq('Board shirts')) $$, '42501', null,
  'signed-out visitors cannot respond');

-- ------------------------------------------------------------ who may respond
set local role authenticated;
select pg_temp.as_user('b1000000-0000-4000-8000-000000000004');
select throws_ok($$ select public.respond_to_board_request(pg_temp.rfq('Board shirts')) $$, '42501', null,
  'an unverified supplier cannot respond');
select pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
select throws_ok($$ select public.respond_to_board_request(pg_temp.rfq('Board shirts')) $$, '22023', null,
  'the buyer''s own supplier account cannot respond');

select pg_temp.as_user('b1000000-0000-4000-8000-000000000003');
select is((select count(*)::int from public.rfqs), 0, 'before responding the supplier cannot read the RFQ row');
select is(public.respond_to_board_request(pg_temp.rfq('Board shirts')), true, 'a verified supplier responds');
select is(public.respond_to_board_request(pg_temp.rfq('Board shirts')), false, 'responding again changes nothing');
select is((select count(*)::int from public.rfq_invites where rfq_id = pg_temp.rfq('Board shirts')), 1, 'exactly one invite');
select is((select count(*)::int from public.rfqs), 1, 'now the supplier can open the RFQ like any invite');
select is((select already_responded from public.list_board_requests()), true, 'the board marks it as responded');

reset role;
select is((select status::text from public.rfqs where product = 'Board shirts'), 'invited', 'status moves from matching to invited');
select is((select count(*)::int from public.notifications
  where user_id = 'b1000000-0000-4000-8000-000000000001' and title = 'A supplier wants to quote'), 1, 'the buyer is notified');

-- ------------------------------------------------------------ leaving the board
update public.platform_settings set value = '1' where key = 'rfq_max_invites';
set local role anon;
select pg_temp.as_anon();
select is((select count(*)::int from public.list_board_requests()), 0, 'a full request leaves the board');
reset role;
update public.platform_settings set value = '10' where key = 'rfq_max_invites';
update public.rfqs set required_by = current_date - 1 where product = 'Board shirts';
set local role anon;
select is((select count(*)::int from public.list_board_requests()), 0, 'a request past its date leaves the board');
reset role;
update public.rfqs set required_by = current_date + 30 where product = 'Board shirts';

set local role authenticated;
select pg_temp.as_user('b1000000-0000-4000-8000-000000000001');
select public.set_rfq_board(pg_temp.rfq('Board shirts'), false);
set local role anon;
select pg_temp.as_anon();
select is((select count(*)::int from public.list_board_requests()), 0, 'the buyer can take it off the board');

select * from finish();
rollback;
