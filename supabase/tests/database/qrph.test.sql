-- QR Ph payment method and the shared gateway fee formula (private.gateway_fee).
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

select ok('qrph' = any(enum_range(null::public.payment_method)::text[]), 'qrph is a payment method');
select is((select value #>> '{}' from public.platform_settings where key = 'fee_qrph_bps'), '134', 'QR Ph fee setting defaults to 1.34%');

-- ₱10,000.00 = 1,000,000 centavos; defaults: card 3% + ₱15, e-wallet 2.5%, online banking 2.5%, QR Ph 1.34%.
select is(private.gateway_fee('qrph', 1000000), 13400::bigint, 'QR Ph fee is 1.34%');
select is(private.gateway_fee('card', 1000000), 31500::bigint, 'card fee unchanged: 3% + ₱15');
select is(private.gateway_fee('ewallet', 1000000), 25000::bigint, 'e-wallet fee unchanged');
select is(private.gateway_fee('online_banking', 1000000), 25000::bigint, 'online banking fee unchanged');

update public.platform_settings set value = '150' where key = 'fee_qrph_bps';
select is(private.gateway_fee('qrph', 1000000), 15000::bigint, 'QR Ph fee follows the admin setting');

set local role authenticated;
select throws_ok($$ select private.gateway_fee('qrph', 100) $$, '42501', null, 'users cannot call the fee function directly');

select * from finish();
rollback;
