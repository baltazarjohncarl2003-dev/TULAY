-- Reads that stay small as data grows: chat inbox and unread count, catalog overview, the shared search
-- match and the "oldest" sort, and dashboard counts. Each person sees only their own chats and counts.
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

insert into auth.users (id, email, raw_user_meta_data) values
  ('e1000000-0000-4000-8000-000000000001', 'sr-buyer@test.ph', '{"role":"buyer"}'),
  ('e1000000-0000-4000-8000-000000000002', 'sr-other@test.ph', '{"role":"buyer"}'),
  ('e1000000-0000-4000-8000-000000000003', 'sr-owner@test.ph', '{"role":"supplier"}'),
  ('e1000000-0000-4000-8000-000000000004', 'sr-owner2@test.ph', '{"role":"supplier"}'),
  ('e1000000-0000-4000-8000-000000000005', 'sr-owner3@test.ph', '{"role":"supplier"}');

insert into public.suppliers (id, owner_id, business_name, legal_name, category_id, city, province, moq, lead_days, description, status)
select v.id::uuid, v.owner::uuid, v.name, v.name, (select id from public.categories where slug = 'custom-shirts'), 'Pasig', 'Metro Manila', 1, 7, 'x',
  v.status::public.supplier_status
from (values
  ('e2000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000003', 'Inbox Prints', 'verified'),
  ('e2000000-0000-4000-8000-000000000002', 'e1000000-0000-4000-8000-000000000004', 'Declined Prints', 'verified'),
  ('e2000000-0000-4000-8000-000000000003', 'e1000000-0000-4000-8000-000000000005', 'Pending Prints', 'pending')
) as v(id, owner, name, status);

-- A direct chat: the supplier wrote last, an hour ago.
insert into public.direct_conversations (id, buyer_id, supplier_id, buyer_name, last_message_at)
values ('e3000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001', 'Bea Buyer', now() - interval '1 hour');
insert into public.direct_messages (conversation_id, sender_id, body, idempotency_key, created_at) values
  ('e3000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', 'Hi', gen_random_uuid(), now() - interval '2 hours'),
  ('e3000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000003', 'Hello back', gen_random_uuid(), now() - interval '1 hour');

-- An RFQ invited to two suppliers; one declined.
insert into public.rfqs (id, buyer_id, product, quantity, unit, idempotency_key, status)
values ('e4000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', 'Inbox shirts', 10, 'pcs', gen_random_uuid(), 'invited');
insert into public.rfq_invites (rfq_id, supplier_id, status) values
  ('e4000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001', 'invited'),
  ('e4000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000002', 'declined');
insert into public.rfq_messages (rfq_id, supplier_id, sender_id, body, created_at)
values ('e4000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000003', 'Quote coming', now() - interval '3 hours');

-- Listings: five approved and one draft for Inbox Prints, one approved for the pending supplier.
insert into public.products (id, supplier_id, category_id, title, description, moq, unit, return_class, status, idempotency_key, created_at)
select v.id::uuid, v.sup::uuid, (select id from public.categories where slug = 'custom-shirts'), v.title, 'Inboxwidget tee', 1, 'pcs', 'standard',
  v.status::public.product_status, gen_random_uuid(), now() - make_interval(days => v.age)
from (values
  ('e5000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000001', 'Tee one', 'approved', 5),
  ('e5000000-0000-4000-8000-000000000002', 'e2000000-0000-4000-8000-000000000001', 'Tee two', 'approved', 4),
  ('e5000000-0000-4000-8000-000000000003', 'e2000000-0000-4000-8000-000000000001', 'Tee three', 'approved', 3),
  ('e5000000-0000-4000-8000-000000000004', 'e2000000-0000-4000-8000-000000000001', 'Tee four', 'approved', 2),
  ('e5000000-0000-4000-8000-000000000005', 'e2000000-0000-4000-8000-000000000001', 'Tee five', 'approved', 1),
  ('e5000000-0000-4000-8000-000000000006', 'e2000000-0000-4000-8000-000000000001', 'Tee draft', 'draft', 0),
  ('e5000000-0000-4000-8000-000000000007', 'e2000000-0000-4000-8000-000000000003', 'Tee hidden', 'approved', 0),
  ('e5000000-0000-4000-8000-000000000008', 'e2000000-0000-4000-8000-000000000001', 'Tee ancient', 'approved', 40000)
) as v(id, sup, title, status, age);

create function pg_temp.as_user(u text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated', 'aal', 'aal1')::text, true); $$;
grant execute on function pg_temp.as_user(text) to authenticated;

-- ---------------------------------------------------------------- inbox, buyer side
select pg_temp.as_user('e1000000-0000-4000-8000-000000000001');
set local role authenticated;

select is((select count(*)::int from public.chat_inbox()), 2, 'the buyer sees the direct chat and one RFQ thread (the declined invite has none)');
select is((select name || '|' || side || '|' || last_body from public.chat_inbox() where kind = 'direct'), 'Inbox Prints|buyer|Hello back',
  'a direct chat shows the supplier name and the newest message');
select is((select id from public.chat_inbox() limit 1), 'e3000000-0000-4000-8000-000000000001', 'newest activity first');
select is((select subtitle from public.chat_inbox() where kind = 'rfq'), (select ref from public.rfqs where id = 'e4000000-0000-4000-8000-000000000001') || ' · Inbox shirts',
  'an RFQ thread shows its ref and product');
select ok((select unread from public.chat_inbox() where kind = 'direct'), 'unread: the other party wrote and nothing was read');
select is(public.chat_unread_count(), 2, 'the badge counts both unread chats');

select public.mark_chat_read('e3000000-0000-4000-8000-000000000001');
select ok(not (select unread from public.chat_inbox() where kind = 'direct'), 'read once the marker passes the newest message');
reset role;
insert into public.direct_messages (conversation_id, sender_id, body, idempotency_key, created_at)
values ('e3000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', 'Mine', gen_random_uuid(), now() + interval '1 minute');
set local role authenticated;
select ok(not (select unread from public.chat_inbox() where kind = 'direct'), 'the viewer''s own newer message does not make it unread');
reset role;
insert into public.direct_messages (conversation_id, sender_id, body, idempotency_key, created_at)
values ('e3000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000003', 'Theirs', gen_random_uuid(), now() + interval '2 minutes');
set local role authenticated;
select ok((select unread from public.chat_inbox() where kind = 'direct'), 'unread again after a newer reply');
select is((select count(*)::int from public.chat_inbox(p_unread_only => true)), 2, 'the unread filter returns only unread chats');

-- Keyset paging: page 2 continues after page 1 with no overlap.
select is(
  (select id from public.chat_inbox(
    (select coalesce(last_at, '-infinity') from public.chat_inbox(p_limit => 1)),
    (select id from public.chat_inbox(p_limit => 1)),
    1)),
  'e4000000-0000-4000-8000-000000000001:e2000000-0000-4000-8000-000000000001',
  'the next page starts after the cursor');
select is((select deal_counts->>'buyer_rfqs' from public.deal_counts()), '1', 'the buyer counts their own RFQ');
select is((select deal_counts->>'supplier_invites' from public.deal_counts()), '0', 'the buyer has no supplier invites');
reset role;

-- ---------------------------------------------------------------- supplier side and other people
select pg_temp.as_user('e1000000-0000-4000-8000-000000000003');
set local role authenticated;
select is((select name || '|' || side from public.chat_inbox() where kind = 'direct'), 'Bea Buyer|supplier', 'the supplier sees the buyer''s name');
select is((select name from public.chat_inbox() where kind = 'rfq'), 'Buyer · ' || (select ref from public.rfqs where id = 'e4000000-0000-4000-8000-000000000001'),
  'in an RFQ thread the buyer stays anonymous');
select is((select deal_counts->>'supplier_invites' from public.deal_counts()), '1', 'the supplier counts its invite');
reset role;

select pg_temp.as_user('e1000000-0000-4000-8000-000000000004');
set local role authenticated;
select is((select count(*)::int from public.chat_inbox()), 0, 'a supplier that declined has no thread');
reset role;

select pg_temp.as_user('e1000000-0000-4000-8000-000000000002');
set local role authenticated;
select is((select count(*)::int from public.chat_inbox()) + public.chat_unread_count(), 0, 'another buyer sees no chats and no unread');
reset role;

set local role anon;
select throws_ok($$ select * from public.chat_inbox() $$, '42501', null, 'visitors cannot read an inbox');
select throws_ok($$ select public.deal_counts() $$, '42501', null, 'visitors cannot read deal counts');

-- ---------------------------------------------------------------- catalog, as a visitor
select is(
  (select jsonb_agg(t->>'title') from jsonb_array_elements(public.catalog_overview()->'tiles'->'e2000000-0000-4000-8000-000000000001') t),
  '["Tee five", "Tee four", "Tee three", "Tee two"]'::jsonb,
  'a supplier''s tiles are its 4 newest approved listings (drafts left out)');
select ok(not (public.catalog_overview()->'tiles') ? 'e2000000-0000-4000-8000-000000000003', 'listings of a supplier not yet verified are not shown');
select is((select product_id from public.search_catalog('', p_sort => 'oldest', p_page_size => 1)), 'e5000000-0000-4000-8000-000000000008'::uuid,
  'the oldest sort starts with the oldest live listing');
select is(public.search_catalog_supplier_ids('Inboxwidget'),
  (select array_agg(distinct p.supplier_id) from public.search_catalog('Inboxwidget', p_page_size => 500) s join public.products p on p.id = s.product_id),
  'the supplier search matches the same listings as search_catalog');
reset role;

select * from finish();
rollback;
