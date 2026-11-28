-- Abuse limits: chat messages per minute per account, and files per upload folder (both admin settings).
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

insert into auth.users (id, email, raw_user_meta_data) values
  ('ab000000-0000-4000-8000-000000000001', 'ab-buyer@test.ph', '{"role":"buyer"}'),
  ('ab000000-0000-4000-8000-000000000002', 'ab-owner@test.ph', '{"role":"supplier"}');

insert into public.suppliers (id, owner_id, business_name, legal_name, category_id, city, province, moq, lead_days, description, status)
values ('ab100000-0000-4000-8000-000000000001', 'ab000000-0000-4000-8000-000000000002', 'Limit Prints', 'Limit Prints',
  (select id from public.categories limit 1), 'Manila', 'Metro Manila', 1, 1, 'Test', 'verified');

update public.platform_settings set value = '2' where key = 'chat_messages_per_minute';
update public.platform_settings set value = '2' where key = 'upload_max_files_per_folder';

create function pg_temp.as_user(p_id text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated', 'aal', 'aal1')::text, true);
$$;
grant execute on function pg_temp.as_user(text) to authenticated;
set local role authenticated;

-- ---------------------------------------------------------------- chat message rate (limit 2 a minute)
select pg_temp.as_user('ab000000-0000-4000-8000-000000000001');
select lives_ok($$ select public.send_direct_message(null, 'ab100000-0000-4000-8000-000000000001', 'One', 'ab200000-0000-4000-8000-000000000001') $$,
  'the first message goes through');
select lives_ok($$ select public.send_direct_message(null, 'ab100000-0000-4000-8000-000000000001', 'Two', 'ab200000-0000-4000-8000-000000000002') $$,
  'the second message goes through');
select throws_ok($$ select public.send_direct_message(null, 'ab100000-0000-4000-8000-000000000001', 'Three', 'ab200000-0000-4000-8000-000000000003') $$,
  '22023', null, 'the third message in a minute is refused');

select pg_temp.as_user('ab000000-0000-4000-8000-000000000002');
select lives_ok($$ select public.send_direct_message((select id from public.direct_conversations), null, 'Reply', 'ab200000-0000-4000-8000-000000000004') $$,
  'the other party can still send in the same chat');

-- An offer row is a money step: stored even for the capped sender.
reset role;
select lives_ok($$ insert into public.direct_messages (conversation_id, sender_id, body, idempotency_key, kind, payload)
  select id, 'ab000000-0000-4000-8000-000000000001', 'Offer', 'ab200000-0000-4000-8000-000000000005', 'offer', '{}'::jsonb
  from public.direct_conversations $$,
  'an offer row is stored even when the sender is over the chat limit');

-- ---------------------------------------------------------------- upload folder caps (limit 2 files)
set local role authenticated;
select pg_temp.as_user('ab000000-0000-4000-8000-000000000002');
select lives_ok($$ insert into storage.objects (bucket_id, name) values
  ('supplier-documents', 'ab100000-0000-4000-8000-000000000001/a.pdf'),
  ('supplier-documents', 'ab100000-0000-4000-8000-000000000001/b.pdf') $$,
  'a supplier owner uploads two files into their folder');
select throws_ok($$ insert into storage.objects (bucket_id, name) values
  ('supplier-documents', 'ab100000-0000-4000-8000-000000000001/c.pdf') $$,
  '42501', null, 'a third file in the folder is refused');

reset role;
update public.platform_settings set value = '3' where key = 'upload_max_files_per_folder';
set local role authenticated;
select pg_temp.as_user('ab000000-0000-4000-8000-000000000002');
select lives_ok($$ insert into storage.objects (bucket_id, name) values
  ('supplier-documents', 'ab100000-0000-4000-8000-000000000001/c.pdf') $$,
  'the third file is accepted once the setting is raised');

-- The count must not leak across folder names or buckets: two files each next door, none in the folder asked about.
reset role;
update public.platform_settings set value = '2' where key = 'upload_max_files_per_folder';
insert into storage.objects (bucket_id, name) values
  ('order-files', 'x/artwork2/a.png'), ('order-files', 'x/artwork2/b.png'),
  ('product-media', 'x/artwork/a.png'), ('product-media', 'x/artwork/b.png');
select ok(public.upload_folder_has_room('order-files', 'x/artwork'),
  'a folder has room when only a similar folder name and another bucket hold files');

set local role anon;
select throws_ok($$ select public.upload_folder_has_room('order-files', 'x/artwork') $$,
  '42501', null, 'anon cannot run the folder check');
reset role;

select * from finish();
rollback;
