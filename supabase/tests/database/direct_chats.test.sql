-- Direct chats: only the two parties read or write, retries do not duplicate, read tracking is per user.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

insert into auth.users (id, email, raw_user_meta_data) values
  ('a8000000-0000-4000-8000-000000000001', 'dc-buyer@test.ph', '{"role":"buyer"}'),
  ('a8000000-0000-4000-8000-000000000002', 'dc-owner@test.ph', '{"role":"supplier"}'),
  ('a8000000-0000-4000-8000-000000000003', 'dc-other@test.ph', '{"role":"buyer"}'),
  ('a8000000-0000-4000-8000-000000000004', 'dc-pending@test.ph', '{"role":"supplier"}');
update public.profiles set business_name = 'Buyer Trading Co' where id = 'a8000000-0000-4000-8000-000000000001';

insert into public.suppliers (id, owner_id, business_name, legal_name, category_id, city, province, moq, lead_days, description, status)
select v.id::uuid, v.owner::uuid, v.name, v.name, (select id from public.categories limit 1), 'Manila', 'Metro Manila', 1, 1, 'Test', v.status::public.supplier_status
from (values
  ('a9000000-0000-4000-8000-000000000001', 'a8000000-0000-4000-8000-000000000002', 'Verified Prints', 'verified'),
  ('a9000000-0000-4000-8000-000000000002', 'a8000000-0000-4000-8000-000000000004', 'Pending Prints', 'pending')
) as v(id, owner, name, status);

create function pg_temp.as_user(p_id text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_id, 'role', 'authenticated', 'aal', 'aal1')::text, true);
$$;
grant execute on function pg_temp.as_user(text) to authenticated;
set local role authenticated;

-- Buyer starts a chat from a supplier card.
select pg_temp.as_user('a8000000-0000-4000-8000-000000000001');
select lives_ok($$ select public.send_direct_message(null, 'a9000000-0000-4000-8000-000000000001', 'Hello', 'b0000000-0000-4000-8000-000000000001') $$,
  'a buyer starts a chat with a verified supplier');
select lives_ok($$ select public.send_direct_message(null, 'a9000000-0000-4000-8000-000000000001', 'Hello', 'b0000000-0000-4000-8000-000000000001') $$,
  'a retry with the same key succeeds');
select is((select count(*)::int from public.direct_messages), 1, 'the retry adds no second message');
select throws_ok($$ select public.send_direct_message(null, 'a9000000-0000-4000-8000-000000000002', 'Hi', 'b0000000-0000-4000-8000-000000000002') $$,
  '22023', null, 'an unverified supplier cannot be messaged');
select throws_ok($$ select public.send_direct_message(null, 'a9000000-0000-4000-8000-000000000001', '   ', 'b0000000-0000-4000-8000-000000000003') $$,
  '22023', null, 'a blank message is refused');
select throws_ok($$ insert into public.direct_messages (conversation_id, sender_id, body, idempotency_key)
  select id, auth.uid(), 'x', gen_random_uuid() from public.direct_conversations $$,
  '42501', null, 'messages cannot be inserted directly');

-- Supplier sees the buyer's business name and replies.
select pg_temp.as_user('a8000000-0000-4000-8000-000000000002');
select is((select buyer_name from public.direct_conversations), 'Buyer Trading Co', 'the supplier sees the buyer business name');
select lives_ok($$ select public.send_direct_message((select id from public.direct_conversations), null, 'Hi there', 'b0000000-0000-4000-8000-000000000004') $$,
  'the supplier replies');
select throws_ok($$ select public.send_direct_message(null, 'a9000000-0000-4000-8000-000000000001', 'Me', 'b0000000-0000-4000-8000-000000000005') $$,
  '22023', null, 'a supplier cannot message its own business');
select lives_ok($$ select public.mark_chat_read((select id::text from public.direct_conversations)) $$, 'a party marks the chat read');
select is((select count(*)::int from public.chat_reads), 1, 'the read marker is stored');

-- A stranger sees and does nothing. The id is captured before switching user.
reset role;
create temp table conv on commit drop as select id from public.direct_conversations;
grant select on conv to authenticated;
set local role authenticated;
select pg_temp.as_user('a8000000-0000-4000-8000-000000000003');
select is((select count(*)::int from public.direct_conversations), 0, 'a stranger sees no conversations');
select is((select count(*)::int from public.direct_messages), 0, 'a stranger sees no messages');
select is((select count(*)::int from public.chat_reads), 0, 'a stranger sees no read markers');
select throws_ok($$ select public.send_direct_message((select id from conv), null, 'Sneak', 'b0000000-0000-4000-8000-000000000006') $$,
  'P0002', null, 'a stranger cannot post into the chat');
select throws_ok($$ select public.mark_chat_read((select id::text from conv)) $$,
  'P0002', null, 'a stranger cannot mark the chat read');

select * from finish();
rollback;
