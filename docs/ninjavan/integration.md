# TULAY × Ninja Van: Plugin Integration

What Ninja Van asks plugin partners to hand in: plugin name, sandbox redirect URI, scopes, a C4 Level-2 diagram and an API sequence diagram. This file holds all five. Diagrams are Mermaid; export them as PNG for the email.

| Item | Value |
| --- | --- |
| Plugin name | TULAY |
| What it is | Philippine B2B marketplace. Suppliers sell; buyers order; each supplier ships on its **own** Ninja Van account. |
| Sandbox redirect URI | `https://<staging-domain>/api/ninjavan/callback` (fill in at step 4) |
| Local redirect URI | `http://127.0.0.1:3000/api/ninjavan/callback` |
| Webhook URL | `https://<staging-domain>/api/webhooks/shipping` |
| Scopes | `NINJAVAN_SCOPES` env var. TODO(ninjavan): confirm the PH names for create order + tracking webhooks. |
| COD | Collected by Ninja Van and remitted to the supplier's own account. TULAY never holds the cash. |
| Waybills | Printed by TULAY (QR + Code-128 of the tracking number), so no Waybill API calls. |

## C4 Level 2: containers

```mermaid
flowchart LR
  buyer([Buyer]) -->|places order, tracks parcel| web
  supplier([Supplier]) -->|connects Ninja Van, books pickups, prints waybills| web
  subgraph TULAY
    web["Next.js web app (Vercel)<br/>pages, Server Actions,<br/>/api/ninjavan/connect + callback,<br/>/api/webhooks/shipping"]
    db[("Supabase Postgres<br/>orders, shipments, tracking_events,<br/>courier_connections; tokens in Vault")]
    web -->|RPC / RLS| db
  end
  web -->|OAuth consent redirect| dash["Ninja Dash<br/>(supplier login + consent)"]
  web -->|token exchange, create order| api["Ninja Van API"]
  api -->|tracking webhooks, HMAC-signed| web
  api -. COD remittance .-> bank([Supplier bank account])
```

## API sequence

```mermaid
sequenceDiagram
  actor S as Supplier
  participant T as TULAY web app
  participant V as Supabase (Vault)
  participant D as Ninja Dash
  participant N as Ninja Van API
  S->>T: Connect Ninja Van
  T->>T: random state in httpOnly cookie
  T->>D: redirect (client_id, scope, state, redirect_uri)
  S->>D: log in, allow
  D->>T: /api/ninjavan/callback?code&state
  T->>T: state matches cookie?
  T->>N: POST token (authorization_code)
  N-->>T: access_token, refresh_token, expiry
  T->>V: store tokens (encrypted)
  Note over S,T: later, per order
  S->>T: Book pickup (one or many)
  T->>V: load token (reuse until 5 min before expiry)
  T->>N: POST create order (requested_tracking_number = order ref)
  alt 401
    T->>N: POST token (refresh_token), then retry once
  else 5xx / network
    T->>N: same request again (max 3 attempts, backoff)
  else 4xx
    T->>T: log, show the supplier the error, no resend
  end
  N-->>T: tracking_number
  T->>T: record shipment, print waybill
  N->>T: webhook (status), signed
  T->>T: verify HMAC, store event once, notify buyer
```

## Audit rules and where the code meets them

| Ninja Van rule | Where |
| --- | --- |
| Store token + expiry; refresh only ≤ 5 min before expiry or after 401 | `lib/shipping/ninjavan-auth.ts`, tokens in `private.courier_tokens` + Vault |
| Retry 5xx only; on 4xx log and don't resend | `lib/shipping/ninjavan-http.ts` |
| Same order never booked twice | `requested_tracking_number` from the order ref (`ninjavan-wire.ts`) + unique `shipments.order_id` |
| Push webhooks, no polling | `app/api/webhooks/shipping/route.ts` (signature, idempotent per event id, 200 for ignored statuses) |
| Own waybill with QR + Code-128 | `lib/shipping/waybill.ts`, `/ship/waybills` |
| One-click (bulk) order creation showing tracking numbers | Supplier Orders: "Book N Pickups" + Tracking column |
| One-click (bulk) waybills in a new tab | "Print N Waybills" after booking |
| Settings: credentials, sender address, preferences | Company Profile → Ninja Van card |
| Live status + customer notifications | order page tracking timeline; `record_tracking_event` notifies the buyer |
| Suppliers subscribe to events in their dashboard | reminder on the Ninja Van card |

All Ninja Van paths, fields and status names are in `lib/shipping/ninjavan-wire.ts`, marked `TODO(ninjavan)` until checked against the PH docs.
