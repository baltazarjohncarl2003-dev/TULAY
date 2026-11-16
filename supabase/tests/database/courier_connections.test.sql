-- Courier connections: tokens in Vault, readable only by the service role; suppliers see only their own status.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

insert into auth.users (id, email, raw_user_meta_data) values
  ('c1000000-0000-4000-8000-000000000001', 'cs1@test.ph', '{"role":"supplier"}'),
  ('c1000000-0000-4000-8000-000000000002', 'cs2@test.ph', '{"role":"supplier"}'),
  ('c1000000-0000-4000-8000-000000000003', 'cs3@test.ph', '{"role":"supplier"}');
insert into public.suppliers (id, owner_id, business_name, legal_name, category_id, city, province, moq, lead_days, description, status)
select v.id, v.owner, v.name, v.name, (select id from public.categories limit 1), 'Pasig', 'Metro Manila', 1, 7, 'x', v.status::public.supplier_status
from (values
  ('c2000000-0000-4000-8000-000000000001'::uuid, 'c1000000-0000-4000-8000-000000000001'::uuid, 'Conn Co', 'verified'),
  ('c2000000-0000-4000-8000-000000000002'::uuid, 'c1000000-0000-4000-8000-000000000002'::uuid, 'Other Co', 'verified'),
  ('c2000000-0000-4000-8000-000000000003'::uuid, 'c1000000-0000-4000-8000-000000000003'::uuid, 'Pending Co', 'pending')
) as v (id, owner, name, status);

create function pg_temp.as_user(p_id text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated', 'aal', 'aal1')::text, true);
$$;
grant execute on all functions in schema pg_temp to authenticated, service_role;

-- ------------------------------------------------------------ service role stores and reads tokens
set local role service_role;
select lives_ok($$ select public.courier_save_tokens('c2000000-0000-4000-8000-000000000001', 'ninjavan', 'acc-1', 'ref-1', now() + interval '1 hour', 'ORDER') $$,
  'service role saves tokens');
select is((select access_token from public.courier_load_tokens('c2000000-0000-4000-8000-000000000001', 'ninjavan')), 'acc-1', 'tokens read back');
select lives_ok($$ select public.courier_save_tokens('c2000000-0000-4000-8000-000000000001', 'ninjavan', 'acc-2', 'ref-2', now() + interval '2 hours', null) $$,
  'refresh updates the same secret');
select is((select access_token from public.courier_load_tokens('c2000000-0000-4000-8000-000000000001', 'ninjavan')), 'acc-2', 'new token read back');
reset role;
select is((select scopes from public.courier_connections where supplier_id = 'c2000000-0000-4000-8000-000000000001'), 'ORDER', 'null scopes keep the saved ones');
select is((select count(*)::int from private.courier_tokens), 1, 'one token row per connection');
set local role service_role;
select throws_ok($$ select public.courier_save_tokens('c2000000-0000-4000-8000-000000000003', 'ninjavan', 'a', 'r', now() + interval '1 hour', '') $$,
  '42501', null, 'unverified supplier cannot connect');
select throws_ok($$ select public.courier_save_tokens('c2000000-0000-4000-8000-000000000001', 'jnt', 'a', 'r', now() + interval '1 hour', '') $$,
  '23514', null, 'unknown carrier rejected');

-- ------------------------------------------------------------ suppliers
set local role authenticated;
select pg_temp.as_user('c1000000-0000-4000-8000-000000000001');
select throws_ok($$ select * from public.courier_load_tokens('c2000000-0000-4000-8000-000000000001', 'ninjavan') $$,
  '42501', null, 'a supplier cannot read tokens, even its own');
select throws_ok($$ select * from private.courier_tokens $$, '42501', null, 'private token table is closed');
select is((select status from public.courier_connections), 'connected', 'supplier sees its own connection');

select pg_temp.as_user('c1000000-0000-4000-8000-000000000002');
select is((select count(*)::int from public.courier_connections), 0, 'another supplier sees nothing');
select lives_ok($$ select public.set_pickup_settings('Other Co', '09171234567', '1 St', '', '', 'Pasig', 'Metro Manila', '1600', 800) $$,
  'supplier saves pickup settings');
select throws_ok($$ select public.set_pickup_settings('Other Co', 'call me', '1 St', '', '', 'Pasig', 'Metro Manila', '', 800) $$,
  '23514', null, 'bad phone rejected');

select pg_temp.as_user('c1000000-0000-4000-8000-000000000001');
select lives_ok($$ select public.disconnect_courier('ninjavan') $$, 'supplier disconnects');
set local role service_role;
select is((select count(*)::int from public.courier_load_tokens('c2000000-0000-4000-8000-000000000001', 'ninjavan')), 0,
  'disconnected: no tokens left');

select * from finish();
rollback;
