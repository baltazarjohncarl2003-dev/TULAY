-- Profile pictures: users write only their own avatars folder; a profile can only point into its own folder.
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

insert into auth.users (id, email, raw_user_meta_data) values
  ('a7000000-0000-4000-8000-000000000001', 'av1@test.ph', '{"role":"buyer"}'),
  ('a7000000-0000-4000-8000-000000000002', 'av2@test.ph', '{"role":"buyer"}');

create function pg_temp.as_user(p_id text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated', 'aal', 'aal1')::text, true);
$$;
grant execute on function pg_temp.as_user(text) to authenticated;
set local role authenticated;
select pg_temp.as_user('a7000000-0000-4000-8000-000000000001');

select lives_ok(
  $$ insert into storage.objects (bucket_id, name) values ('avatars', 'a7000000-0000-4000-8000-000000000001/me.png') $$,
  'a user uploads into their own folder');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('avatars', 'a7000000-0000-4000-8000-000000000002/me.png') $$,
  '42501', null, 'a user cannot upload into someone else''s folder');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('avatars', 'me.png') $$,
  '42501', null, 'a file outside any folder is refused');

update public.profiles set avatar_path = 'a7000000-0000-4000-8000-000000000001/me.png'
  where id = 'a7000000-0000-4000-8000-000000000001';
select is(
  (select avatar_path from public.profiles where id = 'a7000000-0000-4000-8000-000000000001'),
  'a7000000-0000-4000-8000-000000000001/me.png', 'a user sets their own avatar');
select throws_ok(
  $$ update public.profiles set avatar_path = 'a7000000-0000-4000-8000-000000000002/me.png'
     where id = 'a7000000-0000-4000-8000-000000000001' $$,
  '23514', null, 'a profile cannot point at another user''s file');

update public.profiles set avatar_path = 'a7000000-0000-4000-8000-000000000002/x.png'
  where id = 'a7000000-0000-4000-8000-000000000002';
select is(
  (select avatar_path from public.profiles where id = 'a7000000-0000-4000-8000-000000000002'),
  null, 'a user cannot change another user''s profile');

select pg_temp.as_user('a7000000-0000-4000-8000-000000000002');
select is(
  (select count(*)::int from storage.objects where bucket_id = 'avatars' and name like 'a7000000-0000-4000-8000-000000000001/%'),
  0, 'a user cannot list someone else''s files (public URL reads only)');

select * from finish();
rollback;
