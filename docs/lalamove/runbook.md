# Lalamove Runbook

How to switch TULAY's courier to Lalamove. Facts and diagrams are in `integration.md`.

## Sandbox setup (owner approval needed; never commit keys)

1. The owner registers at partnerportal.lalamove.com and selects the sandbox environment (top right of the portal).
2. Copy the sandbox key and secret from the Developers tab (they start `pk_test` and `sk_test`) into `.env.local` (local) or the staging env vars:
   - `COURIER_PROVIDER=lalamove`
   - `LALAMOVE_API_BASE=https://rest.sandbox.lalamove.com`
   - `LALAMOVE_API_KEY`, `LALAMOVE_API_SECRET`
   - `LALAMOVE_MARKET=PH`, `LALAMOVE_WEBHOOK_PATH=/api/webhooks/shipping`
   - no `LALAMOVE_MOCK`
3. Register the webhook URL `https://<domain>/api/webhooks/shipping` in the Partner Portal (Developers > Webhook), or with `PATCH /v3/webhook` and body `{"data":{"url":"..."}}`. The URL must be public (not localhost) and must answer 200, including to an empty-body probe. If the URL fails 10 times in a day Lalamove disables it; register it again.
4. `LALAMOVE_WEBHOOK_PATH` must equal the path of the registered URL, because the path is part of the signature.

## Check in the sandbox before go-live

1. Vehicle keys: call `GET /v3/cities` with `Market: PH` (through the app's vehicle list) and write down the real Philippine keys. Set each test supplier's default vehicle from them.
2. A quote: pin a pickup and a delivery address, run checkout, confirm a live delivery price shows. Sandbox prices are mock values, not real rates.
3. A booking: as the supplier, book the pickup. Expect one `POST /v3/orders`, a tracking number, a share link, and, if the booked price is lower than the quote, a refund of the difference to the buyer.
4. A price rise: confirm the supplier is told the buyer must pay the difference, and booking works after the buyer pays the delivery top-up.
5. The webhook signature: confirm a real Lalamove webhook verifies (watch the logs; a rejected one means the signature, path or key is wrong). Try one with an address containing "ñ".
6. An `EXPIRED` order voids: the shipment is marked voided, the ledger entry is reversed, the supplier can book again. How to trigger this in the sandbox is not documented; ask Lalamove partner support (partner.support@lalamove.com) or use the portal's status function if it exists.
7. A `CANCELED` order only flags support; check support sees the "Courier needs a check" notice, then use "Void courier booking" on the admin order page after checking the Lalamove dashboard.
8. An uncertain booking (timeout, 5xx): the order stays claimed. Support checks the Lalamove dashboard. If a booking exists, use "Record courier booking" on the admin order page (Lalamove order id, booked price, optional share link). If none exists, use "Release booking claim" so the supplier can book again.
9. While a delivery top-up is due, the supplier can re-check the price; if it fell back within what the buyer paid, the top-up is dropped and booking goes ahead.

## Production

1. Lalamove gives production keys only after the production wallet is topped up. The owner does this.
2. Production needs the owner's explicit approval. Set `LALAMOVE_API_BASE=https://rest.lalamove.com` and the production key and secret (they start `pk_prod` and `sk_prod`) in the host's env vars only. Never commit keys.
3. Register the production webhook URL (the portal has a separate toggle per environment).
4. Keep the wallet funded: an empty wallet makes bookings fail with `ERR_INSUFFICIENT_CREDIT`, and suppliers see "not available right now".
5. Tell Lalamove partner support when going live (`partner.support@lalamove.com`, as the docs ask).
