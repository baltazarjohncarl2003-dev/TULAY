# Ninja Van Audit Runbook

Ninja Van QA checks the integration in their sandbox: 3 test orders per audited API, partly by an automated check, 1–3 weeks. TULAY prints its own waybills, so only the **Create Order** audit applies.

## Before (needs the business permit)

1. Email Ninja Van PH from the TULAY business address. Ask for:
   - the PH plugin-partner process and a dev-support contact
   - plugin sandbox credentials, the authorize URL, API base URL and scope names
   - the 3 PH audit scenarios (exact parcel, COD and address details)
   - the webhook signature header and method, and whether delivered events carry the COD amount
   - token lifetime and whether refresh tokens are issued
   - how a duplicate `requested_tracking_number` is answered
   - the full API docs as text or PDF (save them in this folder)
2. Send them `integration.md` (with the diagrams exported as PNG).
3. Check every `TODO(ninjavan)` in `lib/shipping/ninjavan-wire.ts` against the docs and fix what differs. Rerun `npm test`.
4. Replace the 3 placeholder scenarios in `lib/shipping/ninjavan.test.ts` with Ninja Van's exact ones; they must pass against the mock first.

## Sandbox setup (staging only, needs owner approval)

1. Staging env vars: `COURIER_PROVIDER=ninjavan`, `NINJAVAN_API_BASE`, `NINJAVAN_AUTHORIZE_URL`, `NINJAVAN_SCOPES`, `NINJAVAN_CLIENT_ID`, `NINJAVAN_CLIENT_SECRET`. No `NINJAVAN_MOCK`. Never commit them.
2. Register the staging redirect URI and webhook URL with Ninja Van.
3. A verified test supplier: Company Profile → Ninja Van → fill in the pickup address → Connect Ninja Van → log in to the sandbox Ninja Dash → allow.
4. In the sandbox Ninja Van dashboard, subscribe to tracking events.

## Running the audit

1. Click the link in Ninja Van's audit email, answer "Yes" to both questions.
2. For each of the 3 scenarios: create a matching test order as a buyer, then as the supplier use **Book Ninja Van Pickup** (or **Book 3 Pickups** on Orders). Don't retry by hand: a failed booking shows its reason; fix the cause first.
3. Put each scenario's tracking number into the audit form. Submit.
4. Watch the server logs: expect one token call, three create-order calls, no 4xx.
5. If QA reports errors (no API calls, token errors), fix, then repeat from step 1.

## After approval

Production credentials go in only with the owner's explicit approval. Switch the base URL to production, keep everything else.
