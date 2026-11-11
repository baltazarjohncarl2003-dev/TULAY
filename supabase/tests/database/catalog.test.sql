-- Stage 2 catalog, product workflow, buy-and-sell accounts and saved items. Run with `supabase test db`.
begin;
create extension if not exists pgtap with schema extensions;
select plan(47);

-- Hide local seed data (supabase/seed.sql) so counts only see this file's fixtures; rolled back at the end.
update public.suppliers set status = 'suspended';

-- Users: buyer, verified supplier, pending supplier, verifier admin, buyer who will apply to sell.
insert into auth.users (id, email, raw_user_meta_data) values
  ('c0000000-0000-4000-8000-000000000001', 'cb@test.ph', '{"role":"buyer"}'),
  ('c0000000-0000-4000-8000-000000000002', 'cs1@test.ph', '{"role":"supplier"}'),
  ('c0000000-0000-4000-8000-000000000003', 'cs2@test.ph', '{"role":"supplier"}'),
  ('c0000000-0000-4000-8000-000000000004', 'cv@test.ph', '{}'),
  ('c0000000-0000-4000-8000-000000000005', 'cx@test.ph', '{"role":"buyer"}');
update public.profiles set role = 'admin' where id = 'c0000000-0000-4000-8000-000000000004';
insert into public.admin_roles (user_id, sub_role) values ('c0000000-0000-4000-8000-000000000004', 'verifier');
insert into public.suppliers (id, owner_id, business_name, legal_name, category_id, city, province, moq, lead_days, description, status)
select v.id, v.owner, v.name, v.name, (select id from public.categories where slug = 'custom-shirts'), 'Pasig', 'Metro Manila', 10, 7, 'x', v.status::public.supplier_status
from (values
  ('d0000000-0000-4000-8000-000000000001'::uuid, 'c0000000-0000-4000-8000-000000000002'::uuid, 'Verified Co', 'verified'),
  ('d0000000-0000-4000-8000-000000000002'::uuid, 'c0000000-0000-4000-8000-000000000003'::uuid, 'Pending Co', 'pending')
) as v (id, owner, name, status);

-- ------------------------------------------------------------ category tree
select is((select count(*)::int from public.categories where parent_id is null), 12, '12 top-level categories');
select is((select p.slug from public.categories c join public.categories p on p.id = c.parent_id where c.slug = 'custom-shirts'),
  'clothing-textiles', 'custom shirts re-parented under clothing');
select is((select name from public.categories where slug = 'packaging'), 'Packaging & printing', 'packaging renamed');

-- ------------------------------------------------------------ one account buys and sells
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000005","role":"authenticated","aal":"aal1"}', true);
select lives_ok(
  $$ select public.submit_supplier_application('Buyer Shop', 'Buyer Shop Inc', 'packaging', 'Pasig', 'Metro Manila', 10, 7, 'We print') $$,
  'a buyer can apply to sell');
select is((select role::text from public.profiles where id = auth.uid()), 'supplier', 'applying makes the account a supplier');
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000004","role":"authenticated","aal":"aal2"}', true);
select throws_ok(
  $$ select public.submit_supplier_application('Admin Shop', 'Admin Shop', 'packaging', 'Pasig', 'Metro Manila', 10, 7, 'x') $$,
  '42501', null, 'admins cannot apply to sell');

-- ------------------------------------------------------------ pending supplier
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal1"}', true);
select throws_ok(
  $$ select public.create_product(gen_random_uuid(), 'custom-shirts', 'Shirt', 'Cotton', 10, 'pcs', 28500, 7, 'custom', 'product') $$,
  '42501', null, 'pending supplier cannot list products');
select lives_ok(
  $$ update public.suppliers set keywords = 'pouch, sachet', business_type = 'wholesaler', delivery_areas = '{Luzon}', years_operating = 3
     where owner_id = auth.uid() $$,
  'owner edits listing details');
select is((select business_type::text from public.suppliers where owner_id = auth.uid()), 'wholesaler', 'listing details saved');
select throws_ok($$ update public.suppliers set status = 'verified' where owner_id = auth.uid() $$,
  '42501', null, 'owner cannot change supplier status');
update public.suppliers set keywords = 'hacked' where business_name = 'Verified Co';
select is((select count(*)::int from public.suppliers where keywords = 'hacked'), 0, 'cannot edit another supplier');

-- ------------------------------------------------------------ verified supplier creates a product
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}', true);
select lives_ok(
  $$ select public.create_product('e0000000-0000-4000-8000-000000000001', 'custom-shirts', 'Cotton shirt', 'Printed cotton', 10, 'pcs', 28500, 7, 'custom', 'product',
       '[{"minQty": 500, "unitPriceCentavos": 25000}]') $$,
  'verified supplier creates a product');
select lives_ok(
  $$ select public.create_product('e0000000-0000-4000-8000-000000000001', 'custom-shirts', 'Cotton shirt', 'Printed cotton', 10, 'pcs', 28500, 7, 'custom', 'product') $$,
  'retry with the same idempotency key');
select is((select count(*)::int from public.products where supplier_id = 'd0000000-0000-4000-8000-000000000001'), 1, 'retry created nothing new');
select is((select status::text from public.products where supplier_id = 'd0000000-0000-4000-8000-000000000001'), 'draft', 'new products start as drafts');
select is((select count(*)::int from public.price_tiers), 1, 'price tier saved');
select throws_ok(
  $$ select public.create_product(gen_random_uuid(), 'custom-shirts', 'Shirt', 'x', 100, 'pcs', 28500, 7, 'custom', 'product',
       '[{"minQty": 100, "unitPriceCentavos": 25000}]') $$,
  '22023', null, 'a tier must start above the MOQ');
select throws_ok(
  $$ select public.create_product(gen_random_uuid(), 'no-such-category', 'Shirt', 'x', 1, 'pcs', null, null, 'custom', 'product') $$,
  '22023', null, 'unknown category rejected');
select throws_ok(
  $$ select public.create_product(gen_random_uuid(), 'custom-shirts', 'Shirt', 'x', 1, 'pcs', 0, null, 'custom', 'product') $$,
  '23514', null, 'price must be positive centavos');
select throws_ok($$ insert into public.products (supplier_id, category_id, title, description, moq, unit, return_class, idempotency_key)
     select supplier_id, category_id, 'x', 'x', 1, 'pcs', 'standard', gen_random_uuid() from public.products $$,
  '42501', null, 'products cannot be inserted directly');

-- drafts stay private
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is((select count(*)::int from public.products where supplier_id = 'd0000000-0000-4000-8000-000000000001'), 0, 'anon cannot see a draft');
select is((select count(*)::int from public.price_tiers), 0, 'anon cannot see a draft''s tiers');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}', true);
select is((select count(*)::int from public.products where supplier_id = 'd0000000-0000-4000-8000-000000000001'), 0, 'other users cannot see a draft');

-- submit + media
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}', true);
select lives_ok($$ select public.submit_product((select id from public.products where supplier_id = 'd0000000-0000-4000-8000-000000000001')) $$, 'supplier submits the draft');
select throws_ok($$ select public.admin_review_product((select id from public.products where supplier_id = 'd0000000-0000-4000-8000-000000000001'), 'approved') $$,
  '42501', null, 'supplier cannot approve their own product');
select lives_ok(
  $$ insert into public.product_media (product_id, storage_path)
     select id, 'd0000000-0000-4000-8000-000000000001/' || id || '/front.jpg' from public.products $$,
  'owner adds an image before approval');
select throws_ok(
  $$ insert into public.product_media (product_id, storage_path)
     select id, 'd0000000-0000-4000-8000-000000000002/' || id || '/x.jpg' from public.products $$,
  '42501', null, 'image path must be the owner''s folder');

-- ------------------------------------------------------------ admin review
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000004","role":"authenticated","aal":"aal1"}', true);
select is((select count(*)::int from public.products where supplier_id = 'd0000000-0000-4000-8000-000000000001'), 0, 'admin without MFA sees no products');
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000004","role":"authenticated","aal":"aal2"}', true);
select throws_ok($$ select public.admin_review_product((select id from public.products where supplier_id = 'd0000000-0000-4000-8000-000000000001'), 'rejected', '') $$,
  '22023', null, 'rejecting needs a reason');
select lives_ok($$ select public.admin_review_product((select id from public.products where supplier_id = 'd0000000-0000-4000-8000-000000000001'), 'approved') $$, 'verifier approves');
select throws_ok($$ select public.admin_review_product((select id from public.products where supplier_id = 'd0000000-0000-4000-8000-000000000001'), 'draft') $$,
  '22023', null, 'invalid review transition refused');

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is((select count(*)::int from public.products where supplier_id = 'd0000000-0000-4000-8000-000000000001'), 1, 'approved product is public');
select is((select count(*)::int from public.price_tiers), 1, 'its tiers are public');
select is((select count(*)::int from public.product_media), 1, 'its images are public');

-- editing an approved product re-opens review
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}', true);
select throws_ok(
  $$ insert into public.product_media (product_id, storage_path)
     select id, 'd0000000-0000-4000-8000-000000000001/' || id || '/back.jpg' from public.products $$,
  '42501', null, 'no new images on a live listing');
select lives_ok(
  $$ select public.update_product((select id from public.products where supplier_id = 'd0000000-0000-4000-8000-000000000001'), 'custom-shirts', 'Cotton shirt v2', 'Printed cotton', 10, 'pcs', 27500, 7, 'custom', 'product') $$,
  'owner edits the approved product');
select is((select status::text from public.products where supplier_id = 'd0000000-0000-4000-8000-000000000001'), 'pending', 'edit sends it back to review');
select is((select count(*)::int from public.price_tiers), 0, 'edit replaced the tiers');
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is((select count(*)::int from public.products where supplier_id = 'd0000000-0000-4000-8000-000000000001'), 0, 'edited product is hidden until re-approved');

-- suspended supplier: listings disappear
reset role;
update public.products set status = 'approved' where supplier_id = 'd0000000-0000-4000-8000-000000000001';
update public.suppliers set status = 'suspended' where id = 'd0000000-0000-4000-8000-000000000001';
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is((select count(*)::int from public.products where supplier_id = 'd0000000-0000-4000-8000-000000000001'), 0, 'a suspended supplier''s listings are hidden');

reset role;
select throws_ok($$ delete from public.product_status_history $$, '42501', null, 'product history is append-only');
select is((select count(*)::int from public.audit_log where action like 'product.%'), 4, 'create, submit, review and edit audited');

-- ------------------------------------------------------------ saved items
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}', true);
select lives_ok($$ insert into public.saved_items (kind, target_id) values ('product', 'e0000000-0000-4000-8000-0000000000aa') $$, 'buyer saves a product');
select lives_ok($$ insert into public.saved_items (kind, target_id) values ('product', 'e0000000-0000-4000-8000-0000000000aa') on conflict do nothing $$,
  'saving twice is harmless');
select is((select count(*)::int from public.saved_items), 1, 'one saved row');
select throws_ok(
  $$ insert into public.saved_items (user_id, kind, target_id) values ('c0000000-0000-4000-8000-000000000002', 'product', gen_random_uuid()) $$,
  '42501', null, 'cannot save for someone else');
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}', true);
select is((select count(*)::int from public.saved_items), 0, 'others cannot see saved items');

select * from finish();
rollback;
