-- Local development only (runs on `supabase db reset`, never on hosted projects).
-- Sign in at /login with one of these emails and read the 6-digit code in Mailpit: http://127.0.0.1:54424
--   buyer@tulay.test     buyer
--   supplier@tulay.test  supplier (no application yet)
--   admin@tulay.test     super admin (enrol an authenticator app on first sign-in)
--   supplier1@tulay.test ... supplier13@tulay.test  sample supplier owners (supplier1 = PrintHaus Manila, verified;
--                        supplier5 = Supot Pouch Works, pending; the rest verified)
-- The sample suppliers and their listings are local sample data only, never real offers.
-- Categories, settings and the 0% commission schedule come from the migrations.

insert into auth.users (
  instance_id, id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, encrypted_password, confirmation_token, recovery_token, email_change,
  email_change_token_new, email_change_token_current, phone_change, phone_change_token, reauthentication_token
)
select
  '00000000-0000-0000-0000-000000000000', v.id, 'authenticated', 'authenticated', v.email, now(),
  '{"provider":"email","providers":["email"]}', jsonb_build_object('full_name', v.name, 'role', v.role),
  now(), now(), '', '', '', '', '', '', '', '', ''
from (values
  ('11111111-1111-4111-8111-111111111111'::uuid, 'buyer@tulay.test', 'Alex Reyes', 'buyer'),
  ('22222222-2222-4222-8222-222222222222'::uuid, 'supplier@tulay.test', 'Maria Santos', 'supplier'),
  ('33333333-3333-4333-8333-333333333333'::uuid, 'admin@tulay.test', 'TULAY Admin', 'buyer'),
  ('a1000000-0000-4000-8000-000000000001'::uuid, 'supplier1@tulay.test', 'PrintHaus Manila', 'supplier'),
  ('a1000000-0000-4000-8000-000000000002'::uuid, 'supplier2@tulay.test', 'Kahon Packaging Co.', 'supplier'),
  ('a1000000-0000-4000-8000-000000000003'::uuid, 'supplier3@tulay.test', 'Cebu SubliPrints', 'supplier'),
  ('a1000000-0000-4000-8000-000000000004'::uuid, 'supplier4@tulay.test', 'IDentity Cards PH', 'supplier'),
  ('a1000000-0000-4000-8000-000000000005'::uuid, 'supplier5@tulay.test', 'Supot Pouch Works', 'supplier'),
  ('a1000000-0000-4000-8000-000000000006'::uuid, 'supplier6@tulay.test', 'Bukid Fresh Trading', 'supplier'),
  ('a1000000-0000-4000-8000-000000000007'::uuid, 'supplier7@tulay.test', 'Bato at Buhangin Supply', 'supplier'),
  ('a1000000-0000-4000-8000-000000000008'::uuid, 'supplier8@tulay.test', 'Makina Diwa Industrial', 'supplier'),
  ('a1000000-0000-4000-8000-000000000009'::uuid, 'supplier9@tulay.test', 'Salamin Digital Systems', 'supplier'),
  ('a1000000-0000-4000-8000-000000000010'::uuid, 'supplier10@tulay.test', 'Tahanan Muwebles Co.', 'supplier'),
  ('a1000000-0000-4000-8000-000000000011'::uuid, 'supplier11@tulay.test', 'Hiyas General Merchandise', 'supplier'),
  ('a1000000-0000-4000-8000-000000000012'::uuid, 'supplier12@tulay.test', 'Daloy Freight & Storage', 'supplier'),
  ('a1000000-0000-4000-8000-000000000013'::uuid, 'supplier13@tulay.test', 'Tulong Negosyo Advisory', 'supplier')
) as v (id, email, name, role);

insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id::text, u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true), 'email', now(), now(), now()
from auth.users u
where u.email like '%@tulay.test';

update public.profiles set role = 'admin' where email = 'admin@tulay.test';
insert into public.admin_roles (user_id, sub_role)
select id, 'super_admin' from public.profiles where email = 'admin@tulay.test';

-- ---------------------------------------------------------------- sample supplier listings (local only)

insert into public.suppliers (id, owner_id, business_name, legal_name, category_id, city, province, moq, lead_days, description, status, business_type, years_operating, delivery_areas, keywords, max_quantity, submitted_at, reviewed_at)
select v.id, v.owner_id, v.business_name, v.legal_name, (select id from public.categories where slug = v.category), v.city, v.province, v.moq, v.lead_days, v.description, v.status::public.supplier_status, v.business_type::public.business_type, v.years_operating, v.delivery_areas::text[], v.keywords, v.max_quantity, '2026-09-01 09:00+08'::timestamptz, case when v.status = 'verified' then '2026-09-02 09:00+08'::timestamptz end
from (values
  ('b1000000-0000-4000-8000-000000000001'::uuid, 'a1000000-0000-4000-8000-000000000001'::uuid, 'PrintHaus Manila', 'PrintHaus Trading Inc.', 'custom-shirts', 'Pasig', 'Metro Manila', 24, 7, 'Screen print, DTF and embroidery on cotton and dri-fit shirts. In-house design proofing within 24 hours.', 'verified', 'manufacturer', 6, '{"Metro Manila","Rizal","Laguna"}', 'shirts, dtf, embroidery, uniforms', 5000),
  ('b1000000-0000-4000-8000-000000000002'::uuid, 'a1000000-0000-4000-8000-000000000002'::uuid, 'Kahon Packaging Co.', 'Kahon Packaging Corporation', 'boxes', 'Valenzuela', 'Metro Manila', 100, 14, 'Corrugated mailer boxes, folding cartons and printed paper bags for e-commerce and retail brands.', 'verified', 'manufacturer', 11, '{"Nationwide"}', 'mailer box, carton, kraft bag', null),
  ('b1000000-0000-4000-8000-000000000003'::uuid, 'a1000000-0000-4000-8000-000000000003'::uuid, 'Cebu SubliPrints', 'Cebu SubliPrints Enterprises', 'sublimation', 'Mandaue', 'Cebu', 12, 5, 'Full-sublimation jerseys, mugs and tumblers. Small runs welcome.', 'verified', 'manufacturer', null, '{"Cebu","Visayas"}', 'jersey, mug, tumbler, sublimation', 2000),
  ('b1000000-0000-4000-8000-000000000004'::uuid, 'a1000000-0000-4000-8000-000000000004'::uuid, 'IDentity Cards PH', 'IDentity Solutions OPC', 'customized-ids', 'Davao City', 'Davao del Sur', 50, 4, 'PVC ID cards, lanyards and badge holders with variable-data printing.', 'verified', 'supplier', 4, '{"Mindanao","Nationwide"}', 'id card, lanyard, pvc', 10000),
  ('b1000000-0000-4000-8000-000000000005'::uuid, 'a1000000-0000-4000-8000-000000000005'::uuid, 'Supot Pouch Works', 'Supot Pouch Works Inc.', 'pouches', 'Biñan', 'Laguna', 500, 21, 'Stand-up zipper pouches and sachets, food-grade laminates.', 'pending', 'manufacturer', null, '{"Luzon"}', 'pouch, sachet, laminate', null),
  ('b1000000-0000-4000-8000-000000000006'::uuid, 'a1000000-0000-4000-8000-000000000006'::uuid, 'Bukid Fresh Trading', 'Bukid Fresh Trading Corporation', 'fresh-produce', 'La Trinidad', 'Benguet', 50, 2, 'Highland vegetables and green coffee beans sourced from partner farms, packed and trucked to Metro Manila daily.', 'verified', 'wholesaler', 9, '{"Luzon","Metro Manila"}', 'vegetables, highland, arabica, green coffee', 20000),
  ('b1000000-0000-4000-8000-000000000007'::uuid, 'a1000000-0000-4000-8000-000000000007'::uuid, 'Bato at Buhangin Supply', 'Bato at Buhangin Supply Inc.', 'cement-aggregates', 'Cebu City', 'Cebu', 100, 3, 'Bagged cement, sand and gravel, plus hand and power tools for contractors across the Visayas.', 'verified', 'distributor', null, '{"Cebu","Visayas"}', 'cement, gravel, tools, contractor', null),
  ('b1000000-0000-4000-8000-000000000008'::uuid, 'a1000000-0000-4000-8000-000000000008'::uuid, 'Makina Diwa Industrial', 'Makina Diwa Industrial Corporation', 'food-machinery', 'Cabuyao', 'Laguna', 1, 30, 'Stainless food-processing equipment, heat presses and print-shop machinery, built to order. Also stocks plastic resin pellets.', 'verified', 'manufacturer', 14, '{"Nationwide"}', 'kettle, mixer, heat press, resin', 50),
  ('b1000000-0000-4000-8000-000000000009'::uuid, 'a1000000-0000-4000-8000-000000000009'::uuid, 'Salamin Digital Systems', 'Salamin Digital Systems OPC', 'pos-systems', 'Cagayan de Oro', 'Misamis Oriental', 1, 3, 'POS terminals, receipt printers and business laptops with on-site setup for shops and restaurants.', 'verified', 'supplier', 5, '{"Mindanao"}', 'pos, laptop, receipt printer, retail', 500),
  ('b1000000-0000-4000-8000-000000000010'::uuid, 'a1000000-0000-4000-8000-000000000010'::uuid, 'Tahanan Muwebles Co.', 'Tahanan Muwebles Company', 'home-furniture', 'Bacolod', 'Negros Occidental', 2, 21, 'Mahogany and rattan home furniture, plus office desks and workstations made to your dimensions.', 'verified', 'manufacturer', null, '{"Visayas","Nationwide"}', 'furniture, dining set, desk, workstation', 300),
  ('b1000000-0000-4000-8000-000000000011'::uuid, 'a1000000-0000-4000-8000-000000000011'::uuid, 'Hiyas General Merchandise', 'Hiyas General Merchandise Inc.', 'paper-products', 'Zamboanga City', 'Zamboanga del Sur', 20, 5, 'Wholesale paper, kitchenware, cosmetics and hotel amenities for resellers and hospitality buyers.', 'verified', 'wholesaler', 7, '{"Mindanao","Visayas"}', 'bond paper, kitchenware, lip tint, amenities', null),
  ('b1000000-0000-4000-8000-000000000012'::uuid, 'a1000000-0000-4000-8000-000000000012'::uuid, 'Daloy Freight & Storage', 'Daloy Freight and Storage Services Inc.', 'trucking', 'Mabalacat', 'Pampanga', 1, 3, 'Full-truckload hauling across Luzon and pallet warehousing with pick-and-pack near Clark.', 'verified', 'service_provider', 12, '{"Luzon"}', 'trucking, freight, warehouse, pick and pack', null),
  ('b1000000-0000-4000-8000-000000000013'::uuid, 'a1000000-0000-4000-8000-000000000013'::uuid, 'Tulong Negosyo Advisory', 'Tulong Negosyo Advisory Services OPC', 'design-branding', 'Makati', 'Metro Manila', 1, 7, 'Brand identity design and monthly bookkeeping with BIR filing for small and growing businesses.', 'verified', 'service_provider', null, '{"Nationwide"}', 'branding, logo, bookkeeping, BIR', null)
) as v (id, owner_id, business_name, legal_name, category, city, province, moq, lead_days, description, status, business_type, years_operating, delivery_areas, keywords, max_quantity);

insert into public.supplier_status_history (supplier_id, from_status, to_status, reason)
select s.id, null::public.supplier_status, 'pending'::public.supplier_status, '' from public.suppliers s;
insert into public.supplier_status_history (supplier_id, from_status, to_status, reason)
select s.id, 'pending'::public.supplier_status, 'verified'::public.supplier_status, '' from public.suppliers s where s.status = 'verified';

with v as (
  select x.*, (x.created_on || ' 09:00+08')::timestamptz as created_at
  from (values
    ('c1000000-0000-4000-8000-000000000001'::uuid, 'b1000000-0000-4000-8000-000000000001'::uuid, 'custom-shirts', 'Cotton crew-neck shirt with 1-colour print', '180gsm combed cotton, sizes XS–3XL. Screen print front, up to A4 size.', 24, 'pcs', 28500, 7, 'custom', 'product', 'approved', '', '2026-10-01'),
    ('c1000000-0000-4000-8000-000000000002'::uuid, 'b1000000-0000-4000-8000-000000000001'::uuid, 'dtf-prints', 'DTF transfer sheets, gang sheet 22×60 in', 'Hot-peel DTF transfers ready to press. Send your artwork, we gang it.', 5, 'pcs', 45000, 3, 'custom', 'product', 'approved', '', '2026-10-04'),
    ('c1000000-0000-4000-8000-000000000003'::uuid, 'b1000000-0000-4000-8000-000000000001'::uuid, 'custom-shirts', 'Embroidered polo shirt', 'Pique polo with left-chest embroidery, up to 8,000 stitches.', 12, 'pcs', 52000, 10, 'custom', 'product', 'pending', '', '2026-11-05'),
    ('c1000000-0000-4000-8000-000000000004'::uuid, 'b1000000-0000-4000-8000-000000000002'::uuid, 'mailers', 'Printed corrugated mailer box', 'E-flute mailer, 1-colour outside print, sizes from 6×4×2 in.', 100, 'pcs', 3200, 14, 'custom', 'product', 'approved', '', '2026-09-20'),
    ('c1000000-0000-4000-8000-000000000005'::uuid, 'b1000000-0000-4000-8000-000000000002'::uuid, 'paper-bags', 'Kraft paper bag with twisted handle', '120gsm kraft, 1-colour logo print, three standard sizes.', 500, 'pcs', 1450, 12, 'custom', 'product', 'approved', '', '2026-09-22'),
    ('c1000000-0000-4000-8000-000000000006'::uuid, 'b1000000-0000-4000-8000-000000000002'::uuid, 'boxes', 'Plain folding carton (stock)', 'White folding cartons in stock sizes, no print.', 200, 'pcs', 900, 2, 'standard', 'product', 'approved', '', '2026-09-25'),
    ('c1000000-0000-4000-8000-000000000007'::uuid, 'b1000000-0000-4000-8000-000000000003'::uuid, 'sublimation', 'Full-sublimation basketball jersey set', 'Jersey and shorts, unlimited colours, names and numbers included.', 12, 'sets', 65000, 7, 'custom', 'product', 'approved', '', '2026-10-10'),
    ('c1000000-0000-4000-8000-000000000008'::uuid, 'b1000000-0000-4000-8000-000000000003'::uuid, 'customized-mugs', '11 oz sublimation mug, full wrap', 'White ceramic mug, dishwasher-safe coating, gift box optional.', 24, 'pcs', 12000, 5, 'custom', 'product', 'approved', '', '2026-10-12'),
    ('c1000000-0000-4000-8000-000000000009'::uuid, 'b1000000-0000-4000-8000-000000000003'::uuid, 'customized-mugs', 'Stainless tumbler 20 oz, laser engraved', 'Double-wall insulated tumbler with your logo engraved.', 24, 'pcs', null, null, 'custom', 'product', 'approved', '', '2026-10-15'),
    ('c1000000-0000-4000-8000-000000000010'::uuid, 'b1000000-0000-4000-8000-000000000004'::uuid, 'customized-ids', 'PVC ID card, both sides printed', 'CR80 PVC with variable names and photos. Lanyard sold separately.', 50, 'pcs', 3500, 4, 'custom', 'product', 'approved', '', '2026-10-18'),
    ('c1000000-0000-4000-8000-000000000011'::uuid, 'b1000000-0000-4000-8000-000000000004'::uuid, 'customized-ids', 'Printed lanyard with metal hook', '20mm polyester lanyard, full-colour sublimation print.', 100, 'pcs', 4500, 6, 'custom', 'product', 'pending', '', '2026-11-06'),
    ('c1000000-0000-4000-8000-000000000012'::uuid, 'b1000000-0000-4000-8000-000000000004'::uuid, 'labels', 'Vinyl sticker labels, die-cut', 'Waterproof vinyl, any shape.', 500, 'pcs', 250, 5, 'final_sale', 'product', 'rejected', 'Add a photo and list the label sizes you offer.', '2026-10-30'),
    ('c1000000-0000-4000-8000-000000000013'::uuid, 'b1000000-0000-4000-8000-000000000006'::uuid, 'fresh-produce', 'Highland mixed vegetable crate', 'Cabbage, carrots, potatoes and chayote packed in 20 kg crates, picked within 48 hours of dispatch.', 50, 'kg', 8500, 2, 'standard', 'product', 'approved', '', '2026-10-02'),
    ('c1000000-0000-4000-8000-000000000014'::uuid, 'b1000000-0000-4000-8000-000000000006'::uuid, 'coffee-beverages', 'Green Arabica coffee beans, washed', 'Benguet-grown, screen 15+, 60 kg sacks with moisture report.', 100, 'kg', 45000, 7, 'standard', 'product', 'approved', '', '2026-10-03'),
    ('c1000000-0000-4000-8000-000000000015'::uuid, 'b1000000-0000-4000-8000-000000000007'::uuid, 'cement-aggregates', 'Portland cement, 40 kg bag', 'Type 1 general-purpose cement, delivered by pallet.', 200, 'pcs', 26500, 3, 'standard', 'product', 'approved', '', '2026-10-05'),
    ('c1000000-0000-4000-8000-000000000016'::uuid, 'b1000000-0000-4000-8000-000000000007'::uuid, 'hardware-tools', 'Contractor tool set, bulk order', 'Hand tool kits for crews. Contents and brand quoted per project.', 10, 'sets', null, 7, 'standard', 'product', 'approved', '', '2026-10-06'),
    ('c1000000-0000-4000-8000-000000000017'::uuid, 'b1000000-0000-4000-8000-000000000008'::uuid, 'food-machinery', 'Stainless steel cooking kettle, 100 L', 'Steam-jacketed kettle with tilting frame, built to your capacity and power supply.', 1, 'pcs', null, 30, 'custom', 'product', 'approved', '', '2026-10-07'),
    ('c1000000-0000-4000-8000-000000000018'::uuid, 'b1000000-0000-4000-8000-000000000008'::uuid, 'printing-machinery', 'Heat press machine, 40×60 cm', 'Digital temperature and timer, swing-away platen, one-year parts warranty.', 1, 'pcs', 1850000, 5, 'standard', 'product', 'approved', '', '2026-10-08'),
    ('c1000000-0000-4000-8000-000000000019'::uuid, 'b1000000-0000-4000-8000-000000000009'::uuid, 'pos-systems', 'Touchscreen POS terminal with receipt printer', '15 in terminal, thermal printer and cash drawer, setup and training included.', 1, 'sets', 1850000, 3, 'standard', 'product', 'approved', '', '2026-10-09'),
    ('c1000000-0000-4000-8000-000000000020'::uuid, 'b1000000-0000-4000-8000-000000000009'::uuid, 'computers-it', 'Business laptop 15.6 in, 8 GB / 256 GB', 'Office-grade laptops with Windows licence, one-year warranty.', 5, 'pcs', 2850000, 5, 'standard', 'product', 'approved', '', '2026-10-11'),
    ('c1000000-0000-4000-8000-000000000021'::uuid, 'b1000000-0000-4000-8000-000000000010'::uuid, 'home-furniture', 'Mahogany dining set, 6 seats', 'Solid mahogany table with six cushioned chairs, finish colour of your choice.', 2, 'sets', 2450000, 21, 'custom', 'product', 'approved', '', '2026-10-13'),
    ('c1000000-0000-4000-8000-000000000022'::uuid, 'b1000000-0000-4000-8000-000000000010'::uuid, 'office-furniture', 'Office workstation desk with partition', 'Melamine top, steel frame, cable port. Made to your dimensions.', 4, 'pcs', 780000, 14, 'custom', 'product', 'approved', '', '2026-10-14'),
    ('c1000000-0000-4000-8000-000000000023'::uuid, 'b1000000-0000-4000-8000-000000000011'::uuid, 'paper-products', 'A4 bond paper 80gsm, box of 5 reams', '500 sheets per ream, suitable for laser and inkjet.', 20, 'boxes', 135000, 3, 'standard', 'product', 'approved', '', '2026-10-16'),
    ('c1000000-0000-4000-8000-000000000024'::uuid, 'b1000000-0000-4000-8000-000000000011'::uuid, 'kitchenware', 'Stainless steel food pan set', 'Gastronorm pans in assorted sizes with lids, for catering and restaurants.', 12, 'sets', 38000, 5, 'standard', 'product', 'approved', '', '2026-10-17'),
    ('c1000000-0000-4000-8000-000000000025'::uuid, 'b1000000-0000-4000-8000-000000000001'::uuid, 'uniforms', 'Cotton scrub suit set for clinics', 'Top and pants with embroidered clinic name, sizes XS–3XL.', 12, 'sets', 62000, 10, 'custom', 'product', 'approved', '', '2026-10-19'),
    ('c1000000-0000-4000-8000-000000000026'::uuid, 'b1000000-0000-4000-8000-000000000003'::uuid, 'fabrics', 'Sublimation-ready polyester fabric roll', 'Smooth knit polyester, 1.6 m wide, 25 m per roll.', 5, 'pcs', 185000, 4, 'standard', 'product', 'approved', '', '2026-10-20'),
    ('c1000000-0000-4000-8000-000000000027'::uuid, 'b1000000-0000-4000-8000-000000000011'::uuid, 'cosmetics', 'Private-label lip tint, 3 mL', 'Your shade and label, minimum 200 pieces, fill and pack included.', 200, 'pcs', 3800, 14, 'custom', 'product', 'approved', '', '2026-10-22'),
    ('c1000000-0000-4000-8000-000000000028'::uuid, 'b1000000-0000-4000-8000-000000000011'::uuid, 'toiletries', 'Hotel amenity set: soap, shampoo, comb', 'Individually wrapped guest amenity set for hotels and resorts.', 500, 'sets', 2200, 10, 'standard', 'product', 'approved', '', '2026-10-23'),
    ('c1000000-0000-4000-8000-000000000029'::uuid, 'b1000000-0000-4000-8000-000000000002'::uuid, 'boxes', 'Printed rigid gift box, magnetic lid', 'Wrapped greyboard box with full-colour print, sizes to order.', 100, 'pcs', 18500, 18, 'custom', 'product', 'approved', '', '2026-10-25'),
    ('c1000000-0000-4000-8000-000000000030'::uuid, 'b1000000-0000-4000-8000-000000000004'::uuid, 'labels', 'Thermal barcode labels, 100×150 mm roll', 'Direct-thermal shipping labels, 500 per roll, 25 mm core.', 50, 'pcs', 18000, 5, 'standard', 'product', 'approved', '', '2026-10-26'),
    ('c1000000-0000-4000-8000-000000000031'::uuid, 'b1000000-0000-4000-8000-000000000002'::uuid, 'paper-pulp', 'Kraft linerboard, jumbo rolls', '150gsm test liner for corrugating and bag making, sold by weight.', 1000, 'kg', 5800, 10, 'standard', 'product', 'approved', '', '2026-10-28'),
    ('c1000000-0000-4000-8000-000000000032'::uuid, 'b1000000-0000-4000-8000-000000000012'::uuid, 'trucking', 'Full-truckload hauling, Luzon routes', '10-wheeler or 6-wheeler with driver and helper. Priced per route and distance.', 1, 'sets', null, 3, 'final_sale', 'service', 'approved', '', '2026-10-29'),
    ('c1000000-0000-4000-8000-000000000033'::uuid, 'b1000000-0000-4000-8000-000000000012'::uuid, 'warehousing', 'Monthly pallet storage and pick-and-pack', 'Up to 20 pallet positions, inventory report and order packing for one month.', 1, 'sets', 4500000, 7, 'final_sale', 'service', 'approved', '', '2026-10-31'),
    ('c1000000-0000-4000-8000-000000000034'::uuid, 'b1000000-0000-4000-8000-000000000013'::uuid, 'design-branding', 'Brand identity package: logo, palette, guidelines', 'Three logo concepts, two revision rounds, colour palette and a brand guide PDF.', 1, 'sets', 1500000, 14, 'final_sale', 'service', 'approved', '', '2026-11-02'),
    ('c1000000-0000-4000-8000-000000000035'::uuid, 'b1000000-0000-4000-8000-000000000013'::uuid, 'accounting-legal', 'Monthly bookkeeping and BIR filing package', 'Books, monthly VAT or percentage tax filing and quarterly income tax return.', 1, 'sets', 800000, 7, 'final_sale', 'service', 'approved', '', '2026-11-04'),
    ('c1000000-0000-4000-8000-000000000036'::uuid, 'b1000000-0000-4000-8000-000000000008'::uuid, 'plastics-resin', 'PET resin pellets, food grade', 'Virgin bottle-grade PET in 25 kg bags with certificate of analysis.', 1000, 'kg', 9500, 5, 'standard', 'product', 'approved', '', '2026-11-08')
  ) as x (id, supplier_id, category, title, description, moq, unit, price, lead_days, return_class, listing_type, status, note, created_on)
)
insert into public.products (id, supplier_id, category_id, title, description, moq, unit, indicative_price_centavos, lead_days, return_class, listing_type, status, review_note, idempotency_key, created_at, submitted_at, reviewed_at)
select v.id, v.supplier_id, (select id from public.categories where slug = v.category), v.title, v.description, v.moq, v.unit::public.product_unit, v.price::bigint, v.lead_days, v.return_class::public.return_class, v.listing_type::public.listing_type, v.status::public.product_status, v.note, gen_random_uuid(), v.created_at, v.created_at, case when v.status <> 'pending' then v.created_at + interval '1 day' end
from v;

insert into public.product_status_history (product_id, from_status, to_status, reason)
select p.id, null::public.product_status, 'pending'::public.product_status, '' from public.products p;
insert into public.product_status_history (product_id, from_status, to_status, reason)
select p.id, 'pending'::public.product_status, p.status, p.review_note from public.products p where p.status in ('approved', 'rejected');

insert into public.price_tiers (product_id, min_qty, unit_price_centavos) values
  ('c1000000-0000-4000-8000-000000000004', 500, 2800),
  ('c1000000-0000-4000-8000-000000000004', 1000, 2500),
  ('c1000000-0000-4000-8000-000000000008', 100, 10500),
  ('c1000000-0000-4000-8000-000000000023', 100, 125000);
