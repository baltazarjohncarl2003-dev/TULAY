-- AI chat history: private to the owner, retries do not duplicate turns, the first title sticks.
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

insert into auth.users (id, email, raw_user_meta_data) values
  ('ac000000-0000-4000-8000-000000000001', 'ai-one@test.ph', '{"role":"buyer"}'),
  ('ac000000-0000-4000-8000-000000000002', 'ai-two@test.ph', '{"role":"buyer"}');

create function pg_temp.as_user(p_id text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated', 'aal', 'aal1')::text, true);
$$;
grant execute on function pg_temp.as_user(text) to authenticated;
set local role authenticated;

select pg_temp.as_user('ac000000-0000-4000-8000-000000000001');
select lives_ok($$ select public.save_ai_turn('ad000000-0000-4000-8000-000000000001', 0, '100 mugs', 'Got it', 'Custom mugs', '[]') $$,
  'the first turn creates the chat');
select lives_ok($$ select public.save_ai_turn('ad000000-0000-4000-8000-000000000001', 0, '100 mugs', 'Got it', 'Custom mugs', '[]') $$,
  'a retried turn succeeds');
select is((select jsonb_array_length(turns) from public.ai_chats), 1, 'the retry adds no second turn');
select lives_ok($$ select public.save_ai_turn('ad000000-0000-4000-8000-000000000001', 1, 'make it 200', 'Updated', 'Other title', '[]') $$,
  'a follow-up turn is added');
select is((select title from public.ai_chats), 'Custom mugs', 'the title stays from the first turn');
select throws_ok($$ insert into public.ai_chats (id, user_id, title) values (gen_random_uuid(), auth.uid(), 'x') $$,
  '42501', null, 'chats cannot be inserted directly');

select pg_temp.as_user('ac000000-0000-4000-8000-000000000002');
select is((select count(*)::int from public.ai_chats), 0, 'another user sees no chats');
select throws_ok($$ select public.save_ai_turn('ad000000-0000-4000-8000-000000000001', 2, 'sneak', 'x', 'x', '[]') $$,
  'P0002', null, 'another user cannot write into the chat');
delete from public.ai_chats where id = 'ad000000-0000-4000-8000-000000000001';

select pg_temp.as_user('ac000000-0000-4000-8000-000000000001');
select is((select count(*)::int from public.ai_chats), 1, 'another user cannot delete the chat');
delete from public.ai_chats where id = 'ad000000-0000-4000-8000-000000000001';
select is((select count(*)::int from public.ai_chats), 0, 'the owner deletes their chat');

select * from finish();
rollback;
