-- TULAY's courier account: one access token in Vault, readable only by the service role. Suppliers keep pickup settings.
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

insert into auth.users (id, email, raw_user_meta_data) values
  ('c1000000-0000-4000-8000-000000000001', 'cs1@test.ph', '{"role":"supplier"}'),
  ('c1000000-0000-4000-8000-000000000002', 'cs2@test.ph', '{"role":"supplier"}');
insert into public.suppliers (id, owner_id, business_name, legal_name, category_id, city, province, moq, lead_days, description, status)
select v.id, v.owner, v.name, v.name, (select id from public.categories limit 1), 'Pasig', 'Metro Manila', 1, 7, 'x', v.status::public.supplier_status
from (values
  ('c2000000-0000-4000-8000-000000000001'::uuid, 'c1000000-0000-4000-8000-000000000001'::uuid, 'Conn Co', 'verified'),
  ('c2000000-0000-4000-8000-000000000002'::uuid, 'c1000000-0000-4000-8000-000000000002'::uuid, 'Other Co', 'verified')
) as v (id, owner, name, status);

create function pg_temp.as_user(p_id text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated', 'aal', 'aal1')::text, true);
$$;
grant execute on all functions in schema pg_temp to authenticated, service_role;

-- ------------------------------------------------------------ service role stores and reads TULAY's token
set local role service_role;
select is((select count(*)::int from public.courier_load_platform_token('ninjavan')), 0, 'no token before the first one');
select lives_ok($$ select public.courier_save_platform_token('ninjavan', 'acc-1', now() + interval '1 hour') $$, 'service role saves the token');
select is((select access_token from public.courier_load_platform_token('ninjavan')), 'acc-1', 'token read back');
select lives_ok($$ select public.courier_save_platform_token('ninjavan', 'acc-2', now() + interval '2 hours') $$, 'a new token updates the same secret');
select is((select access_token from public.courier_load_platform_token('ninjavan')), 'acc-2', 'new token read back');
reset role;
select is((select count(*)::int from private.platform_courier_tokens), 1, 'one token row per carrier');
set local role service_role;
select throws_ok($$ select public.courier_save_platform_token('jnt', 'a', now() + interval '1 hour') $$,
  '23514', null, 'unknown carrier rejected');

-- ------------------------------------------------------------ suppliers
set local role authenticated;
select pg_temp.as_user('c1000000-0000-4000-8000-000000000001');
select throws_ok($$ select * from public.courier_load_platform_token('ninjavan') $$,
  '42501', null, 'a supplier cannot read the token');
select throws_ok($$ select * from private.platform_courier_tokens $$, '42501', null, 'private token table is closed');

select pg_temp.as_user('c1000000-0000-4000-8000-000000000002');
select lives_ok($$ select public.set_pickup_settings('Other Co', '09171234567', '1 St', '', '', 'Pasig', 'Metro Manila', '1600', 800) $$,
  'supplier saves pickup settings');
select throws_ok($$ select public.set_pickup_settings('Other Co', 'call me', '1 St', '', '', 'Pasig', 'Metro Manila', '', 800) $$,
  '23514', null, 'bad phone rejected');

select * from finish();
rollback;
