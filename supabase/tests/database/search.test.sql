-- Stage 2 search_catalog: stemming, synonyms, typos, filters, sort and paging. Run with `supabase test db`.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

insert into auth.users (id, email, raw_user_meta_data) values
  ('f0000000-0000-4000-8000-000000000001', 'q1@test.ph', '{"role":"supplier"}'),
  ('f0000000-0000-4000-8000-000000000002', 'q2@test.ph', '{"role":"supplier"}');
insert into public.suppliers (id, owner_id, business_name, legal_name, category_id, city, province, moq, lead_days, description, status, business_type)
select v.id, v.owner, v.name, v.name, (select id from public.categories where slug = 'packaging'), v.city, v.province, 1, 7, 'x', 'verified', v.btype::public.business_type
from (values
  ('f1000000-0000-4000-8000-000000000001'::uuid, 'f0000000-0000-4000-8000-000000000001'::uuid, 'Kahon', 'Valenzuela', 'Metro Manila', 'manufacturer'),
  ('f1000000-0000-4000-8000-000000000002'::uuid, 'f0000000-0000-4000-8000-000000000002'::uuid, 'Subli', 'Mandaue', 'Cebu', 'wholesaler')
) as v (id, owner, name, city, province, btype);

insert into public.products (supplier_id, category_id, title, description, moq, unit, indicative_price_centavos, return_class, listing_type, status, idempotency_key, created_at)
select v.sup, (select id from public.categories where slug = v.cat), v.title, v.descr, v.moq, v.unit::public.product_unit, v.price,
  'custom', v.ltype::public.listing_type, v.status::public.product_status, gen_random_uuid(), now() - (v.age || ' days')::interval
from (values
  ('f1000000-0000-4000-8000-000000000001'::uuid, 'mailers', 'Printed corrugated mailer box', 'E-flute mailer with logo', 100, 'pcs', 3200::bigint, 'product', 'approved', 1),
  ('f1000000-0000-4000-8000-000000000001'::uuid, 'paper-bags', 'Kraft paper bag with twisted handle', '120gsm kraft', 500, 'pcs', 1450::bigint, 'product', 'approved', 2),
  ('f1000000-0000-4000-8000-000000000001'::uuid, 'boxes', 'Secret thing box', 'Not live yet', 1, 'pcs', 100::bigint, 'product', 'draft', 3),
  ('f1000000-0000-4000-8000-000000000002'::uuid, 'customized-mugs', '11 oz sublimation mug, full wrap', 'White ceramic', 24, 'pcs', 12000::bigint, 'product', 'approved', 4),
  ('f1000000-0000-4000-8000-000000000002'::uuid, 'customized-mugs', 'Stainless tumbler 20 oz', 'Laser engraved', 24, 'pcs', null::bigint, 'product', 'approved', 5),
  ('f1000000-0000-4000-8000-000000000002'::uuid, 'design-branding', 'Brand identity design', 'Logo and brand guide', 1, 'sets', 1500000::bigint, 'service', 'approved', 6)
) as v (sup, cat, title, descr, moq, unit, price, ltype, status, age);

create function pg_temp.first_title(q text) returns text language sql as $$
  select p.title from public.search_catalog(q) r join public.products p on p.id = r.product_id limit 1
$$;
grant execute on function pg_temp.first_title(text) to anon;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select is(pg_temp.first_title('boxes'), 'Printed corrugated mailer box', 'plural matches singular (stemming)');
select is(pg_temp.first_title('carton'), 'Printed corrugated mailer box', 'synonym: carton finds box');
select is((select count(*)::int from public.search_catalog('tumbler')), 2, 'synonym: tumbler also finds mugs');
select is(pg_temp.first_title('tumblr'), 'Stainless tumbler 20 oz', 'typo still matches the title');
select is((select count(*)::int from public.search_catalog('secret')), 0, 'drafts never appear');
select is((select count(*)::int from public.search_catalog('the')), 0, 'stop words alone match nothing');
select is((select count(*)::int from public.search_catalog('', p_category_slug => 'packaging')), 4, 'a parent category includes its children');
select is((select count(*)::int from public.search_catalog('', p_province => 'Cebu')), 3, 'province filter');
select is((select count(*)::int from public.search_catalog('', p_listing_type => 'service')), 1, 'listing type filter');
select is((select count(*)::int from public.search_catalog('', p_business_type => 'manufacturer', p_max_moq => 200)), 1, 'business type + max MOQ');
select is((select count(*)::int from public.search_catalog('', p_max_price_centavos => 5000)), 2, 'price range skips price-on-request');
select is((select p.title from public.search_catalog('', p_sort => 'price_asc') r join public.products p on p.id = r.product_id limit 1),
  'Kraft paper bag with twisted handle', 'sort by price, lowest first');
select is((select max(total_count)::int from public.search_catalog('', p_page => 2, p_page_size => 2)), 5, 'total counts every live listing');
select throws_ok($$ select public.admin_add_search_synonym('tee', 'tshirt') $$, '42501', null, 'anon cannot edit synonyms');

select * from finish();
rollback;
