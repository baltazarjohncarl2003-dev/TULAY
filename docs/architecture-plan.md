# TULAY — Architecture Plan

Nov 8, 2026 · @TULAY B2B

## Summary

Rebuild TULAY as one **Next.js** app (frontend and backend together) styled with **Tailwind CSS**, deployed on **Vercel**, with **Supabase** (Postgres database, login, file storage) behind it. Payments go through a licensed gateway such as PayMongo; TULAY never holds buyer money itself.

**What the current repo is.** It is a Google Apps Script web app: 18 files, about 5,600 lines. Google Sheets is the database (18 sheets), and the browser calls server functions through `google.script.run`. It is branded **BUYSON** (purple, bison mascot, "Buy Smart. Grow Big.") and focused on custom packaging — not the red, general-wholesale TULAY in your brief.

**What already works (pilot level):**

- Email one-time-code login with sessions, rate limits and account profiles
- Supplier applications with admin approval, plus account suspension
- Product listings with admin review, and homepage promotions
- Keyword search with synonyms and supplier matching
- RFQs, supplier quotes, counter-offers, messages, notifications
- An audit log, and a "supplier selected" record

**What does not exist yet:** cart, orders, payments, payouts, inventory, tiered wholesale pricing, Tawad on listed products, shipping, returns and disputes. The code says so itself (`PAYMENTS: 'NOT_IMPLEMENTED'`).

**Verdict:** start a clean TULAY build in the red theme. There is no pilot data to move, so the old code is only a checklist of rules worth keeping. Launch scope is custom print and packaging, in six categories: **custom shirts, DTF prints, sublimation, packaging, customized mugs and customized IDs.** Because most of these are made to order, the plan adds an artwork-and-proof step that a generic wholesale store wouldn't need.

## Recommended stack

Your instinct is right: Supabase + Vercel + Tailwind is a strong, beginner-friendly stack for this. The one piece to add is **Next.js**, which is the framework that ties them together and is built by the same company as Vercel.

| Layer | Tool | What it does for TULAY | Replaces in current code |
| --- | --- | --- | --- |
| Frontend + backend | Next.js (App Router) with TypeScript | Pages, server logic and API routes in one project | `Index.html`, `Client.html`, `google.script.run` calls |
| Styling | Tailwind CSS + shadcn/ui components | Red TULAY theme, mobile-first layouts, ready-made buttons, forms, tables | `Styles.html` (802 lines of custom CSS) |
| Database | Supabase Postgres | Real relational tables, foreign keys, transactions, row-level locking | Google Sheets + `Database.js` |
| Login | Supabase Auth | Email/SMS one-time codes, Google sign-in, sessions, MFA | `Auth.js`, `Sessions` and `AuthCodes` sheets |
| Access rules | Postgres Row Level Security (RLS) | Database enforces "suppliers see only their own orders" | Role checks in `Security.js` |
| Files | Supabase Storage | Product photos, permit and ID uploads, dispute evidence | Image URLs typed by hand |
| Background jobs | Supabase Edge Functions + scheduled jobs (pg\_cron) | Payment webhooks, offer expiry, daily reconciliation | Apps Script triggers |
| Hosting | Vercel | Deploys on every GitHub push; preview link per change | Apps Script web app deployment |
| Payments | PayMongo Platforms (shortlist), Maya Business as backup | Collect payment and split it to each supplier | Nothing yet |

**Why not keep Google Sheets?** Sheets has no real transactions. Two buyers checking out the last 50 boxes at once can both succeed. Your current code works around this with `LockService`, which makes every write wait in one line. That is fine for a pilot but breaks once orders and payments are involved.

**Vercel plan note:** the free Hobby plan is for non-commercial, personal use only ([Vercel docs](https://vercel.com/docs/plans/hobby)). Use it while building; move to Pro before taking real orders.

## System architecture

Every user hits one Next.js app on Vercel; that app is the only thing allowed to talk to the database, the gateway and the couriers.

&#91;embedded content: TULAY architecture · app, data, outside services\]

Postgres (highlighted) is the single source of truth. PayMongo and the couriers report back through webhook routes, and scheduled jobs in Supabase handle offer expiry, reconciliation and payouts.

## Project structure

One GitHub repo, one Next.js app, with the database schema kept as versioned migration files beside it. Route groups split the three audiences so each gets its own layout and login guard.

```
tulay/
├─ app/
│  ├─ (public)/            homepage, products, categories, supplier storefronts, help, legal
│  ├─ (auth)/              sign-in, sign-up, OTP verify, supplier application
│  ├─ (buyer)/             cart, checkout, orders, tracking, RFQs, offers, disputes
│  ├─ (supplier)/          dashboard, listings, inventory, orders, offers, quotes, payouts
│  ├─ (admin)/             verification queue, orders, payments, disputes, settings, audit
│  └─ api/
│     └─ webhooks/         paymongo/, couriers/  (payment and shipment callbacks)
├─ components/            shared UI: ProductCard, PriceTierTable, OfferThread, StatusBadge
├─ lib/
│  ├─ supabase/            browser client, server client, admin client
│  ├─ pricing.ts           tier price lookup, checkout totals
│  ├─ payments/            PayMongo wrapper
│  ├─ shipping/            courier adapters behind one interface
│  └─ validation/          Zod schemas for every form and API input
├─ supabase/
│  ├─ migrations/          numbered SQL files: tables, RLS policies, functions
│  ├─ functions/           Edge Functions: reconcile, expire-offers, payout-run
│  └─ seed.sql             categories and test data
└─ tailwind.config.ts      TULAY red palette and fonts
```

**Rule of thumb:** anything involving money, stock or status changes runs on the server (Server Actions or Postgres functions), never in the browser. The browser only asks; the server decides. Your current code already follows this rule, so keep it.

## Database design

About 55 Postgres tables in twelve areas, each record kept separate and linked by IDs, as your brief requires. Money is stored in centavos as whole numbers (₱90.00 = 9000) so totals never drift from rounding.

| Area | Tables | Key links and rules | From current sheet |
| --- | --- | --- | --- |
| Accounts | `profiles`, `buyer_businesses`, `addresses`, `admin_roles` | `profiles.id` = Supabase Auth user; role: buyer, supplier, admin | Users, AccountProfiles |
| Suppliers | `suppliers`, `supplier_documents`, `supplier_status_history`, `payout_accounts` | Status: pending, under review, verified, rejected, suspended, restricted | Suppliers, SupplierDiscovery |
| Catalog | `categories` (with `parent_id`), `products`, `product_variants`, `price_tiers`, `product_media`, `customization_options` | Options per product: print method (DTF, sublimation, screen), print area, colours, sizes; each option can add to the tier price | Categories, Products |
| Custom work | `artwork_files`, `proofs`, `production_jobs` | Buyer uploads artwork → supplier sends a proof → buyer approves → production starts. The approved proof is frozen on the order item | New |
| Inventory | `inventory`, `inventory_reservations`, `inventory_movements` | Tracks blanks (plain shirts, mugs, ID cards, boxes); made-to-order items use lead time instead of stock | New |
| Tawad | `offers`, `offer_events`, `bargain_settings` | Offer locked to buyer + variant + qty + price + expiry; events are append-only | Offers (RFQ-only today) |
| RFQ | `rfqs`, `rfq_invites`, `quotes` | Accepted quote can become a cart line at its locked price | RFQs, Matches, Quotes, MatchingRuns |
| Orders | `carts`, `cart_items`, `checkouts`, `orders`, `order_items`, `order_status_history` | One `checkout` → many `orders` (one per supplier); `order_items` copy the agreed price and approved proof | Transactions (selection record only) |
| Money | `payments`, `payment_events`, `refunds`, `ledger_entries`, `payouts`, `cod_remittances`, `reconciliation_runs` | Ledger is append-only, double-entry; unique gateway reference blocks duplicates; COD tracked parcel by parcel | New |
| Logistics | `shipments`, `shipment_parcels`, `tracking_events`, `delivery_exceptions` | Ninja Van tracking number and COD amount per parcel | New |
| After-sales | `disputes`, `dispute_messages`, `dispute_evidence`, `reviews` | Review allowed only on a completed order item | New |
| Platform | `conversations`, `messages`, `notifications`, `fee_settings`, `audit_log` | Gateway and COD fee rules editable by admin, no code change | Messages, Notifications, Audit, Promotions |

Revenue and returns add three tables to the list above: `return_requests` (reason, RA number, who pays return shipping) under After-sales, `commission_schedules` (rate, start date, category) under Money, and `featured_placements` (product, slot, start and end date, PayMongo payment) under Platform. Products also get a return class: standard, custom or final sale.

**Three rules the database itself enforces:**

1. Stock can't go below zero (a check constraint plus a locked update when reserving).
2. A completed order, payment or ledger row can't be edited — only reversed by a new row.
3. Every row is visible only to its owner, the other party in the deal, and admins (RLS, next section).

## Login, roles and security

Security lives in three layers: Supabase Auth proves who you are, RLS decides which rows you can touch, and server code checks the business rules.

| Who | Can read | Can change |
| --- | --- | --- |
| Visitor | Approved products, verified supplier storefronts, categories | Nothing |
| Buyer | Own profile, addresses, cart, offers, RFQs, orders, disputes | Those same records, only while still editable |
| Supplier (verified) | Own listings, inventory, orders addressed to them, offers on their products, invited RFQs | Listings, stock, order status up to "shipped", counteroffers |
| Supplier (pending) | Own application and documents | Application only — cannot list or sell |
| Admin | Everything, by sub-role: verifier, support, finance, super-admin | Only what their sub-role allows; every action logged |

**Account security**

- Sign-in by email or SMS one-time code, plus Google. Supabase Auth replaces your hand-built OTP and session tables.
- MFA required for admins and for suppliers changing payout accounts.
- Supplier documents (DTI/SEC, BIR, IDs) in a private storage bucket; only the owner and verifier admins can open them, through short-lived links.
- No card numbers ever touch TULAY: buyers pay on the gateway's hosted checkout.

**Abuse and fraud controls carried over from your current code**

- Rate limits on code requests, offers, RFQs and messages (your `BUYSON_POLICY` values are a good starting point).
- Idempotency keys on every "create" action, so a double-click or refresh can't create two orders or two payments.
- Append-only history for offers, order status and money.

**Audit and privacy**

- `audit_log` records who did what, to which record, when, and from which IP — especially admin and financial actions.
- Data Privacy Act (RA 10173): consent at sign-up, a privacy notice, data export and deletion requests, and a named data protection officer.

## Money flow

PayMongo and Ninja Van hold and move the money; TULAY only records it. PayMongo Platforms still fits, because one online checkout has to be split across several suppliers' child accounts ([PayMongo Platforms docs](https://developers.paymongo.com/docs/paymongo-platforms)). It lists ₱75 per month per activated sub-account; payout timing and refunds are questions to put to PayMongo.

**Fees per payment method**

| Payment method | Fee | On a ₱10,000 order | Source |
| --- | --- | --- | --- |
| Credit/debit card | 3% + ₱15 | ₱315 | PayMongo published rate (from your team) |
| E-wallet (GCash, Maya) | 2.5% | ₱250 | PayMongo published rate (from your team) |
| Online banking | 2.5% | ₱250 | PayMongo published rate (from your team) |
| Cash on delivery | 2.75% COD handling, plus shipping | ₱275 | [Ninja Van COD](https://www.ninjavan.co/en-ph/support/shipper-support/billing-and-invoicing/cash-on-delivery-cod) (Ninja Pro rate) |

Suppliers shoulder these fees, including during Q1 testing, and every payout line shows them.

**Settlement example (GCash)**

| Line | During Q1 testing | Later (example: 2% commission) |
| --- | --- | --- |
| Buyer pays | ₱10,000 | ₱10,000 |
| PayMongo fee (2.5%) | −₱250 | −₱250 |
| TULAY commission | ₱0 | −₱200 |
| Supplier receives | ₱9,750 | ₱9,550 |

**Revenue ramp.** No fees of any kind during Q1 testing, to saturate the market. Afterwards, commission starts small and rises every month, and suppliers can buy featured listings from ₱20.

- Build commission into the ledger from day one, set to 0%. Turning it on is then an admin setting, not new code.
- Rates live in a `commission_schedules` table with start dates, so each month's step is entered in advance.
- The rate in force at checkout is frozen on each order; a later increase never changes a paid order.
- Suppliers see the current and next rate on their dashboard and get notice before each step; the Supplier Agreement must allow scheduled changes.
- PayMongo's split takes the commission as the platform fee automatically.
- Featured listings are a normal PayMongo checkout into TULAY's own account, with TULAY issuing its own BIR invoice.

**Online payment, step by step**

1. Buyer clicks Pay. The server re-checks stock, tier prices, locked offers and MOQ, reserves stock for 15 minutes, then creates one payment for the whole checkout.
2. Buyer pays on PayMongo's hosted page (card, GCash, Maya, QR Ph, online banking).
3. PayMongo calls TULAY's webhook. The server verifies the signature before marking the payment confirmed. A screenshot or an "I've paid" button never counts.
4. In one database transaction: stock moves from reserved to sold, each supplier order becomes "paid", ledger rows are written.
5. Supplier sends the proof, buyer approves, supplier produces and ships with Ninja Van.
6. Payout is released after delivery (see payout timing below).

**Cash on delivery, step by step**

1. Buyer picks COD. Same re-checks; the order is created as "COD pending" with no PayMongo payment.
2. Supplier books the Ninja Van parcel with the COD amount on the waybill.
3. Ninja Van collects at the door and remits straight to the supplier's own bank account (each supplier ships under its own Ninja Van account), minus the COD fee. Buyer cash never passes through TULAY.
4. TULAY's daily job matches Ninja Van's COD report (collected, yet to collect, failed) against each order.

**COD needs two rules for custom goods.** A printed shirt or mug refused at the door can't be resold, so the supplier loses it entirely.

- Custom-printed items require an online downpayment before production (for example 50%); COD covers only the balance. Blank or stock items can be full COD.
- Admin sets a COD limit per order, and buyers with repeated refused deliveries lose COD.

**Payout timing.** Suppliers are paid 7 days after delivery, while buyers keep a 30–60 day dispute window.

- Report windows (5, 30 and 60 days by problem type) are set in Returns and refunds, below.
- A claim that comes after the payout is refunded to the buyer and deducted from the supplier's next payout.
- Confirm with PayMongo that split payouts can be held 7 days and reversed this way.

**Safety rules**

- A unique gateway reference per payment and refund; the same webhook arriving twice changes nothing.
- Refunds are capped at what is still refundable per order item — no double refunds.
- A daily job compares TULAY's ledger with PayMongo's settlement report and Ninja Van's COD report, flagging gaps as "Reconciliation Required".
- Payout holds are an admin action that needs a reason and is logged.

## Returns and refunds

Your draft policy maps cleanly onto the order system: every product is tagged **standard**, **custom** or **final sale**, and each tag carries its own rules. The draft is written for a single shop ("we", "our warehouse"); on TULAY the supplier handles the return first, and TULAY steps in only when they disagree.

| Policy rule (your draft) | How the system enforces it |
| --- | --- |
| Standard items: return within \[30\] days, unused, tags on | A return request opens only on standard items, inside the window counted from Ninja Van's delivery date |
| Buyer pays return shipping unless the supplier erred | The return reason decides: change of mind → buyer ships it back; damaged or wrong → booked on the supplier's Ninja Van account |
| Optional restocking fee | A per-supplier setting, shown on the product page before checkout and deducted from the refund |
| Custom items: cancel only before production | Cancel works until the buyer approves the proof or the supplier marks "In production", then disappears. The \[2 or 24 hour\] clock is a backstop |
| No refunds for buyer error (wrong size, low-res or misspelled design) | Before approving a proof, the buyer confirms size, spelling and image quality; the approved proof is frozen as evidence |
| Damaged, defective or unlike the approved mockup → replace or refund | The claim shows the buyer's photos beside the frozen proof; the supplier picks replace or refund, and admin decides if they disagree |
| Report within \[5\] days with order number and photo or video proof | The claim form can't be sent without at least one photo or video |
| Return Authorization number before shipping back | An approved request gets an RA number and the supplier's return address |
| Refund in \[5–10\] business days to the original payment method | Card and e-wallet refunds go back through PayMongo. COD refunds need the buyer's GCash or bank details, since cash can't be reversed |
| Final sale items can't be returned | A "final sale" tag shown on the product page and at checkout. Gift cards and digital goods aren't sold at launch |

**Report windows, recommended.** The draft's \[5\] days and the decided 30–60 days can both hold if each covers a different problem:

- **5 days:** damaged in transit, wrong item, missing items — visible on unboxing.
- **30 days:** standard-item returns.
- **60 days:** print defects such as peeling, cracking or fading, which show after washing or use.

Philippine consumer law gives buyers remedies for defective goods that a store policy can't waive (your brief cites RA 11967), so have a lawyer check the final windows and wording. Refunds after the day-7 payout are deducted from the supplier's next payout.

## Key flows

Two flows are new to TULAY and need the most care: one checkout that becomes several supplier orders, and Tawad on listed products.

&#91;embedded content: multi-supplier checkout · 1 cart, 1 payment, 3 orders\]

The buyer pays once; each supplier gets an independent order with its own stock, shipping, tracking, invoice, refunds and payout. The checkout re-checks everything before payment and creates all three orders in one database transaction.

&#91;embedded content: Tawad offer states · 5 states\]

Today's code only negotiates inside RFQs. The new `offers` table extends the same append-only idea to any listed product, and the supplier's floor, maximum discount and expiry live in `bargain_settings`.

## Integrations

Each outside service sits behind a small adapter in `lib/`, so swapping a courier or gateway later touches one file, not the whole app.

| Need | Use | Notes | Phase |
| --- | --- | --- | --- |
| Payments, splits, payouts | PayMongo Platforms (sandbox first) | Maya Business as backup | 4 |
| Courier, rates, tracking, COD | Ninja Van only | Each supplier connects its own Ninja Pro account to TULAY by OAuth (Ninja Van Plugin API). TULAY then books orders, prints waybills and receives status webhooks on the supplier's behalf, and COD goes straight to the supplier. Confirm Philippine production access with Ninja Van. Other couriers can be added later behind the same courier interface | 5 |
| Large packaging orders | Supplier-quoted delivery fee on the order | For cartons too big for a normal parcel | 5 |
| Artwork files | Supabase Storage, private bucket | PNG, JPG, PDF and design files with a size limit; preview image generated on upload | 3 |
| Order and account email | Resend or Postmark | Sent from the main tulay domain | 1 |
| AI cold-email outreach | A dedicated outreach tool on a separate sending domain | Keeps spam complaints from hurting order emails; honour opt-outs and the Data Privacy Act. Kept outside the app at launch | Before launch |
| SMS one-time codes | Supabase Auth's built-in SMS providers | Or a local Philippine SMS provider through Supabase's custom SMS hook, if cheaper | 1 |
| Search and filters | Postgres full-text search + trigram matching | Meilisearch or Typesense once the catalog is large | 2 |
| Product images | Supabase Storage with image resizing | — | 1 |
| Bulk product upload | CSV/Excel import parsed on the server | — | 2 |
| Error tracking | Sentry | — | 1 |
| Analytics | Vercel Web Analytics | PostHog for funnels | 7 |

Search synonyms (tee → shirt, tumbler → mug, lanyard → ID) move into a `search_synonyms` table the admin can edit.

## Environments and deployment

Three environments, each with its own Supabase project and its own payment keys, so testing never touches real money or real users.

| Environment | Code branch | Vercel | Supabase project | Payments |
| --- | --- | --- | --- | --- |
| Local | any | `npm run dev` on your laptop | Supabase CLI (local copy) | PayMongo test keys |
| Staging | `develop` + pull requests | Preview deployment per change | `tulay-staging` | PayMongo test keys |
| Production | `main` | Production deployment | `tulay-prod` | PayMongo live keys |

**How a change ships:** push to GitHub → GitHub Actions runs type checks and tests → Vercel builds a preview link → after review, merge to `main` → database migrations run against production → Vercel deploys.

**Keep secrets out of code.** API keys go in Vercel and Supabase environment variables, never in the repo (your current code already follows this with Script Properties).

**Monitoring:** Sentry for errors, Vercel logs for requests, Supabase daily backups (included on Pro, kept 7 days per [Supabase pricing](https://supabase.com/pricing)), and alerts when a webhook or payout fails.

## Build roadmap

Your brief's seven phases group into four stages; the first six phases make the end-to-end MVP, and Phase 7 (analytics, marketing, promotions) follows launch.

&#91;embedded content: MVP roadmap · 4 stages covering brief phases 1–6\]

The week ranges are rough planning estimates for one experienced full-time developer; expect roughly double if you are learning to code as you build. Build commission and featured listings during Money + delivery, switched off, so they can be turned on when Q1 testing ends. Start PayMongo Platforms onboarding and Ninja Van API access during Foundation — approval takes time, and the money stage depends on it.

## Running costs

While you build, the stack costs nothing. At launch, plan for roughly US$55–85 a month in hosting (one developer seat) before PayMongo fees, which scale with sales.

| Item | While building | At launch | Source |
| --- | --- | --- | --- |
| Supabase | Free (500 MB database; project pauses after 1 week idle) | Pro from US$25/month: 8 GB database, 100 GB files, 100,000 monthly users, daily backups | [Supabase pricing](https://supabase.com/pricing) |
| Supabase staging project | — | About US$10/month extra compute (approximate) | Approximate |
| Vercel | Hobby, free (non-commercial only) | Pro, US$20 per developer seat/month | [Vercel docs](https://vercel.com/docs/plans/hobby) |
| PayMongo Platforms | Sandbox, free | ₱75/month per activated supplier sub-account | [PayMongo docs](https://developers.paymongo.com/docs/paymongo-platforms) |
| PayMongo per-payment fees | — | Cards 3% + ₱15; e-wallets and online banking 2.5% (absorbed by suppliers) | Published rates, from your team |
| Ninja Van COD | — | 2.75% COD handling on Ninja Pro, deducted from remittance | [Ninja Van COD](https://www.ninjavan.co/en-ph/support/shipper-support/billing-and-invoicing/cash-on-delivery-cod) |
| Domain (tulay.ph or .com) + outreach domain | — | About ₱1,000–3,000/year each (approximate) | Approximate |
| Email, SMS, error tracking | Free tiers | About US$0–30/month at low volume; SMS billed per message (approximate) | Approximate |
| AI cold-email tool | — | Depends on the tool and volume; not estimated here | — |

During Q1 testing TULAY charges nothing but still pays PayMongo ₱75 a month per active supplier — about ₱7,500 a month at 100 suppliers. Treat that as the cost of the penetration strategy; commission and ₱20+ featured listings cover it afterwards.

## Decisions and first steps

Nearly every launch decision is made; three details remain: the commission ramp, COD rules and the blanks in the returns policy.

**Decided**

| Decision | Choice |
| --- | --- |
| Name and look | TULAY, red theme |
| Launch scope | Custom shirts, DTF prints, sublimation, packaging, customized mugs, customized IDs |
| Business model | Suppliers manufacture; TULAY connects them to buyers; Ninja Van delivers; PayMongo processes payments |
| Existing data | None — clean start |
| Who builds | The developer/CTO, using this plan |
| Testing period | First quarter (assumed Jan–Mar 2027): zero TULAY fees for suppliers, to saturate the market first |
| Commission | 0% during testing, then small and rising every month |
| Featured listings | Paid placements from ₱20 |
| Payments | PayMongo: cards 3% + ₱15; e-wallets and online banking 2.5%; suppliers shoulder these fees, Q1 included |
| Cash on delivery | On, through Ninja Van |
| Courier | Ninja Van only; each supplier ships under its own Ninja Van account |
| Supplier payouts | 7 days after delivery |
| Dispute window | 30–60 days after delivery |
| Growth | AI cold-email outreach |

**Still open**

- [ ] **Commission ramp:** starting rate, monthly step and ceiling (for example 1% after testing, +0.5% a month, stopping at 5%), and how much notice suppliers get before each step.
- [ ] **COD rules:** downpayment % for custom-printed items, and the COD limit per order.
- [ ] **Returns policy blanks:** confirm the 5 / 30 / 60-day report windows, the custom cancellation window (2 or 24 hours), restocking fee or none, and the support email — then a lawyer's review.

**First steps**

1. Create the GitHub repo with Next.js, Tailwind and the Supabase client; deploy an empty red TULAY page to Vercel.
2. Write the first migrations: profiles, suppliers, categories, products, price tiers, customization options.
3. Seed the six categories and their print options (DTF, sublimation, print areas, sizes).
4. In parallel: apply for PayMongo Platforms and request Ninja Van business API access.
5. Rebuild in roadmap order, using the old `api…` functions as the checklist of rules to keep.
6. Retire the Apps Script deployment once staging works end to end.

## Sources

- [Supabase pricing](https://supabase.com/pricing)
- [Vercel Hobby plan](https://vercel.com/docs/plans/hobby)
- [PayMongo Platforms](https://developers.paymongo.com/docs/paymongo-platforms)
- Current code: TULAY-main repo (Apps Script, 18 files), reviewed November 2026
- [Ninja Van COD service](https://www.ninjavan.co/en-ph/support/shipper-support/billing-and-invoicing/cash-on-delivery-cod)
- PayMongo per-payment fees: published rates supplied by the TULAY team
- [Ninja Van Plugin API guidelines](https://sites.google.com/ninjavan.co/ninjaapi/plugin-api)
