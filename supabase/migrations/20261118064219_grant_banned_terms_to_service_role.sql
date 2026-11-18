-- AI Mode (app/(ai)/search/actions.ts) checks needs against the banned list through the admin client, which runs as
-- service_role. The guardrails migration granted EXECUTE only to anon and authenticated, so every AI Mode turn failed.
grant execute on function public.banned_terms_in(text[]) to service_role;
