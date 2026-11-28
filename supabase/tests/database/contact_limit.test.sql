-- Contact form limits: service-role only, a hashed client id is required, each visitor has their own cap,
-- and the site-wide cap applies to signed-out senders only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

insert into auth.users (id, email, raw_user_meta_data) values
  ('c7000000-0000-4000-8000-000000000001', 'contact1@test.ph', '{"role":"buyer"}');

-- 1-2. Only the service role may call it.
set local role anon;
select throws_ok(
  $$ select public.submit_contact_message('general', 'A', 'a@test.ph', '', 'Hello there, first message', repeat('a', 64)) $$,
  '42501', null, 'anon cannot call the contact function');
reset role;
set local role authenticated;
select throws_ok(
  $$ select public.submit_contact_message('general', 'A', 'a@test.ph', '', 'Hello there, first message', repeat('a', 64)) $$,
  '42501', null, 'authenticated cannot call the contact function');
reset role;

-- 3. A client id must be a SHA-256 hex hash.
select throws_ok(
  $$ select public.submit_contact_message('general', 'A', 'a@test.ph', '', 'Hello there, first message', 'abc') $$,
  '22023', null, 'a bad client id is refused');

-- 4. Per-visitor cap.
delete from public.contact_messages;
update public.platform_settings set value = '2' where key = 'contact_messages_per_visitor_per_hour';
update public.platform_settings set value = '100' where key = 'contact_messages_per_hour';
select lives_ok(
  $$ select public.submit_contact_message('general', 'A', 'a1@test.ph', '', 'Hello there, message one', repeat('a', 64)) $$,
  'visitor A first message accepted');
select lives_ok(
  $$ select public.submit_contact_message('general', 'A', 'a2@test.ph', '', 'Hello there, message two', repeat('a', 64)) $$,
  'visitor A second message accepted');
select throws_ok(
  $$ select public.submit_contact_message('general', 'A', 'a3@test.ph', '', 'Hello there, message three', repeat('a', 64)) $$,
  '22023', null, 'visitor A is stopped at their own cap');
select lives_ok(
  $$ select public.submit_contact_message('general', 'B', 'b1@test.ph', '', 'Hello there, from visitor B', repeat('b', 64)) $$,
  'visitor B is not blocked by visitor A');

-- 5. The site-wide cap only applies to signed-out senders.
delete from public.contact_messages;
update public.platform_settings set value = '1' where key = 'contact_messages_per_hour';
select lives_ok(
  $$ select public.submit_contact_message('general', 'A', 'a1@test.ph', '', 'Hello there, signed-out one', repeat('a', 64)) $$,
  'first signed-out message accepted');
select throws_ok(
  $$ select public.submit_contact_message('general', 'B', 'b1@test.ph', '', 'Hello there, signed-out two', repeat('b', 64)) $$,
  '22023', null, 'a second signed-out message hits the site-wide cap');
select lives_ok(
  $$ select public.submit_contact_message('privacy', 'C', 'c1@test.ph', '', 'Hello there, signed-in sender', repeat('c', 64),
       'c7000000-0000-4000-8000-000000000001') $$,
  'a signed-in sender is not blocked by the site-wide cap');

-- 6. The stored row keeps the client hash and the user.
select is(
  (select count(*)::int from public.contact_messages
   where client = repeat('c', 64) and user_id = 'c7000000-0000-4000-8000-000000000001'),
  1, 'the stored message keeps client and user_id');

select * from finish();
rollback;
