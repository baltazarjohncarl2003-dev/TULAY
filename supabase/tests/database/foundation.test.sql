-- Stage 1 RLS and function tests. Run with `supabase test db`.
begin;
create extension if not exists pgtap with schema extensions;
select plan(47);

-- Users: buyer, two suppliers, verifier admin, super admin, finance admin, sneaky signup asking for admin.
insert into auth.users (id, email, raw_user_meta_data) values
  ('a0000000-0000-4000-8000-000000000001', 'b@test.ph', '{"full_name":"Buyer One","role":"buyer"}'),
  ('a0000000-0000-4000-8000-000000000002', 's1@test.ph', '{"full_name":"Supplier One","role":"supplier"}'),
  ('a0000000-0000-4000-8000-000000000003', 's2@test.ph', '{"role":"supplier"}'),
  ('a0000000-0000-4000-8000-000000000004', 'v@test.ph', '{}'),
  ('a0000000-0000-4000-8000-000000000005', 'sa@test.ph', '{}'),
  ('a0000000-0000-4000-8000-000000000006', 'f@test.ph', '{}'),
  ('a0000000-0000-4000-8000-000000000007', 'x@test.ph', '{"role":"admin"}');
update public.profiles set role = 'admin' where id in (
  'a0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000006');
insert into public.admin_roles (user_id, sub_role) values
  ('a0000000-0000-4000-8000-000000000004', 'verifier'),
  ('a0000000-0000-4000-8000-000000000005', 'super_admin'),
  ('a0000000-0000-4000-8000-000000000006', 'finance');

-- ------------------------------------------------------------ sign-up trigger
select is((select role::text from public.profiles where email = 'b@test.ph'), 'buyer', 'signup creates a buyer profile');
select is((select role::text from public.profiles where email = 's1@test.ph'), 'supplier', 'signup can choose supplier');
select is((select role::text from public.profiles where email = 'x@test.ph'), 'buyer', 'signup cannot self-assign admin');
select is((select full_name from public.profiles where email = 'b@test.ph'), 'Buyer One', 'signup copies the full name');

-- ------------------------------------------------------------ anon
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is((select count(*)::int from public.categories), 14, 'anon reads categories');
select throws_ok($$ select * from public.profiles $$, '42501', null, 'anon cannot read profiles');
select throws_ok($$ select public.is_admin() $$, '42501', null, 'anon cannot call admin helpers');

-- ------------------------------------------------------------ buyer
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}', true);
select is((select count(*)::int from public.profiles), 1, 'buyer sees only their own profile');
select lives_ok($$ update public.profiles set full_name = 'Buyer Renamed' where id = auth.uid() $$, 'buyer edits own name');
select is((select full_name from public.profiles where id = auth.uid()), 'Buyer Renamed', 'name saved');
select throws_ok($$ update public.profiles set role = 'admin' where id = auth.uid() $$, '42501', null, 'buyer cannot change own role');
select throws_ok($$ update public.profiles set status = 'active' where id = auth.uid() $$, '42501', null, 'buyer cannot change own status');
select throws_ok($$ update public.profiles set phone = '12345' where id = auth.uid() $$, '23514', null, 'phone format checked in the database');
select throws_ok(
  $$ select public.submit_supplier_application('Shop', 'Shop Inc', 'packaging', 'Pasig', 'NCR', 10, 7, 'We print') $$,
  '42501', null, 'buyer cannot apply as supplier');
select is((select count(*)::int from public.admin_roles), 0, 'buyer sees no admin roles');
select is((select count(*)::int from public.audit_log), 0, 'buyer cannot read the audit log');

-- ------------------------------------------------------------ supplier applies
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}', true);
select lives_ok(
  $$ select public.submit_supplier_application('PrintHaus', 'PrintHaus Inc', 'custom-shirts', 'Pasig', 'Metro Manila', 50, 7, 'DTF and screen printing') $$,
  'supplier submits an application');
select lives_ok(
  $$ select public.submit_supplier_application('PrintHaus Manila', 'PrintHaus Inc', 'custom-shirts', 'Pasig', 'Metro Manila', 50, 7, 'DTF and screen printing') $$,
  'retrying updates the same application');
select is((select count(*)::int from public.suppliers), 1, 'still one application after a retry');
select is((select business_name from public.suppliers), 'PrintHaus Manila', 'retry saved the new name');
select is((select count(*)::int from public.supplier_status_history), 1, 'one history row while still pending');
select throws_ok(
  $$ select public.submit_supplier_application('X', 'X', 'not-a-category', 'Pasig', 'NCR', 1, 1, 'x') $$,
  '22023', null, 'unknown category rejected');
select throws_ok($$ select public.admin_set_supplier_status((select id from public.suppliers), 'verified') $$,
  '42501', null, 'supplier cannot verify themselves');
select throws_ok(
  $$ insert into public.suppliers (owner_id, business_name, legal_name, category_id, city, province, moq, lead_days, description)
     values (auth.uid(), 'x', 'x', (select id from public.categories limit 1), 'x', 'x', 1, 1, 'x') $$,
  '42501', null, 'suppliers cannot insert rows directly');

-- second supplier cannot see or attach documents to the first one's application
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal1"}', true);
select is((select count(*)::int from public.suppliers), 0, 'other supplier cannot see a pending application');
reset role;
create temp table t_sup as select id from public.suppliers where owner_id = 'a0000000-0000-4000-8000-000000000002';
grant select on t_sup to authenticated;
set local role authenticated;
select throws_ok(
  $$ insert into public.supplier_documents (supplier_id, kind, storage_path, file_name)
     select id, 'bir', id || '/bir.pdf', 'bir.pdf' from t_sup $$,
  '42501', null, 'cannot add documents to someone else''s application');

-- ------------------------------------------------------------ verifier
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000004","role":"authenticated","aal":"aal1"}', true);
select throws_ok($$ select public.admin_set_supplier_status((select id from t_sup), 'verified') $$,
  '42501', null, 'admin without MFA (aal1) is refused');
select is((select count(*)::int from public.suppliers), 0, 'admin without MFA sees no pending suppliers');
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000004","role":"authenticated","aal":"aal2"}', true);
select throws_ok($$ select public.admin_set_supplier_status((select id from t_sup), 'rejected', '') $$,
  '22023', null, 'rejecting needs a reason');
select lives_ok($$ select public.admin_set_supplier_status((select id from t_sup), 'verified') $$, 'verifier verifies');
select throws_ok($$ select public.admin_set_supplier_status((select id from t_sup), 'pending') $$,
  '22023', null, 'invalid transition refused');
select throws_ok($$ select public.admin_update_setting('payout_delay_days', '10') $$,
  '42501', null, 'verifier cannot change settings');

-- verified supplier is public and can no longer self-edit
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is((select count(*)::int from public.suppliers), 1, 'verified supplier is public');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}', true);
select throws_ok(
  $$ select public.submit_supplier_application('Changed', 'PrintHaus Inc', 'custom-shirts', 'Pasig', 'Metro Manila', 50, 7, 'x') $$,
  '42501', null, 'verified application is locked');

-- ------------------------------------------------------------ super admin: settings
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000005","role":"authenticated","aal":"aal2"}', true);
select throws_ok($$ select public.admin_update_setting('payout_delay_days', '"ten"') $$, '22023', null, 'setting type checked');
select throws_ok($$ select public.admin_update_setting('payout_delay_days', '1.5') $$, '22023', null, 'settings are whole numbers');
select lives_ok($$ select public.admin_update_setting('payout_delay_days', '10') $$, 'super admin changes a setting');
select ok((select count(*) from public.audit_log where action = 'setting.update') = 1, 'setting change audited');

-- ------------------------------------------------------------ finance: commission schedule
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000006","role":"authenticated","aal":"aal2"}', true);
select throws_ok($$ select public.admin_add_commission_schedule(100, now() - interval '1 day') $$,
  '22023', null, 'commission cannot change retroactively');
select lives_ok($$ select public.admin_add_commission_schedule(100, '2027-04-01 00:00:00+08', null, 'April step') $$,
  'finance schedules a future step');

-- ------------------------------------------------------------ suspension
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000005","role":"authenticated","aal":"aal2"}', true);
select lives_ok($$ select public.admin_set_account_status('a0000000-0000-4000-8000-000000000001', 'suspended', 'Spam RFQs') $$,
  'super admin suspends a buyer');
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}', true);
update public.profiles set full_name = 'Should Not Save' where id = auth.uid();
select is((select full_name from public.profiles where id = auth.uid()), 'Buyer Renamed', 'suspended account cannot edit profile');

-- ------------------------------------------------------------ commission rate + append-only (even for the table owner)
reset role;
select is(public.commission_rate_bps(null, '2027-02-01 00:00:00+08'), 0, 'Q1 rate is 0%');
select is(public.commission_rate_bps(null, '2027-04-02 00:00:00+08'), 100, 'scheduled step applies from its start');
select throws_ok($$ update public.audit_log set action = 'x' $$, '42501', null, 'audit log is append-only');
select throws_ok($$ delete from public.supplier_status_history $$, '42501', null, 'status history is append-only');
select throws_ok($$ delete from public.commission_schedules $$, '42501', null, 'commission schedule is append-only');

select * from finish();
rollback;
