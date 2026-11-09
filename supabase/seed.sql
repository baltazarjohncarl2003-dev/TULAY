-- Local development only (runs on `supabase db reset`, never on hosted projects).
-- Sign in at /login with one of these emails and read the 6-digit code in Mailpit: http://127.0.0.1:54424
--   buyer@tulay.test     buyer
--   supplier@tulay.test  supplier (no application yet)
--   admin@tulay.test     super admin (enrol an authenticator app on first sign-in)
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
  ('33333333-3333-4333-8333-333333333333'::uuid, 'admin@tulay.test', 'TULAY Admin', 'buyer')
) as v (id, email, name, role);

insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id::text, u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true), 'email', now(), now(), now()
from auth.users u
where u.email like '%@tulay.test';

update public.profiles set role = 'admin' where email = 'admin@tulay.test';
insert into public.admin_roles (user_id, sub_role)
select id, 'super_admin' from public.profiles where email = 'admin@tulay.test';
