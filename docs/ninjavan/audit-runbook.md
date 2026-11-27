# Ninja Van Audit Runbook

Ninja Van QA checks the integration in their sandbox: at least 3 test orders created through the integration (not Postman), submitted via the audit link. TULAY prints its own waybills, so only the **Create Order** audit applies; waybill access is a separate request we do not make. TULAY uses the standard shipper API, not the plugin API.

## Before (needs the business permit)

1. Email Ninja Van PH from the TULAY business address. Ask the account manager for:
   - API access on TULAY's shipper account (the docs list a "Postpaid Pro" account as a prerequisite), then the Client ID and Client Key from Ninja Dashboard, Settings > IT Settings
   - sandbox access
   - the audit scenarios (exact parcel and address details)
   - how to register the webhook URL `/api/webhooks/shipping` for TULAY's account
   - answers to the open questions at the end of `integration.md`
2. Send them `integration.md` (with the diagrams exported as PNG).
3. Check every `TODO(ninjavan)` in `lib/shipping/ninjavan-wire.ts` against the docs and the sandbox, and fix what differs. Rerun `npm test`.
4. Replace the 3 placeholder scenarios in `lib/shipping/ninjavan.test.ts` with Ninja Van's exact ones; they must pass against the mock first.

## Sandbox setup (staging only, needs owner approval)

1. Staging env vars: `COURIER_PROVIDER=ninjavan`, `NINJAVAN_API_BASE=https://api-sandbox.ninjavan.co/sg`, `NINJAVAN_CLIENT_ID`, `NINJAVAN_CLIENT_SECRET`. No `NINJAVAN_MOCK`. Never commit them.
2. Register the staging webhook URL `https://<staging-domain>/api/webhooks/shipping` for TULAY's account. How exactly: confirm with the account manager. The URL must be public.
3. A verified test supplier: Company Profile → Ninja Van → fill in the pickup address. There is nothing to connect.
4. Tracking events reach TULAY by webhook, signed with the Client Key in header `X-Ninjavan-Hmac-Sha256`.

## Running the audit

1. Click the link in Ninja Van's audit email, answer "Yes" to both questions.
2. For each of the 3 scenarios: create a matching test order as a buyer, then as the supplier use **Book Ninja Van Pickup** (or **Book 3 Pickups** on Orders). Don't retry by hand: a failed booking shows its reason; fix the cause first.
3. Put each scenario's tracking number into the audit form. Submit.
4. Watch the server logs: expect one token call, three create-order calls, no 4xx.
5. If QA reports errors (no API calls, token errors), fix, then repeat from step 1.

## After approval

Production credentials go in only with the owner's explicit approval. Switch `NINJAVAN_API_BASE` to `https://api.ninjavan.co/ph`, keep everything else. COD stays off.
