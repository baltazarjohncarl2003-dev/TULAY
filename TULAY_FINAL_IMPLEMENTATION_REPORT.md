# TULAY final implementation report

Date: 2026-11-15. Companion to `TULAY_COMPLETE_AUDIT_CHECKLIST.md`, which has every item with its location, problem, fix and acceptance.

## Summary

| | Count |
| --- | --- |
| Findings logged | 142 (136 first pass + 6 second pass) |
| Implemented and verified `[x]` | 125 |
| Not done yet `[ ]` | 5 |
| Need your decision `[?]` | 10 |
| Blocked externally `[!]` | 2 |

TULAY is **not production-ready yet**. The core money, stock and order logic is sound and well tested. The open items below, the owner decisions, and the external integrations (PayMongo, Ninja Van, real legal details) still stand between this build and a commercial launch.

## How the work was done

- **Audit:** four reviewers (Opus 5.5) read the buyer, supplier/logistics, admin, and public/auth/shared code independently. The master (Opus 5.5) audited the database: all migrations, money, stock, webhooks and RLS.
- **Fixes:** the master wrote everything in SQL, money, auth and security. Nine workers (Sonnet 5.5, medium effort; four had started on Opus) each fixed one area with exclusive file ownership. The master reviewed each result before accepting it.
- **Verification:**
  - Type check, lint, 90 unit tests and 314 database tests (pgTAP) pass.
  - A production build succeeds.
  - Auth email links, password reset and security headers were checked with curl against the running app.
  - **Not done:** no screen was clicked through in a browser, because the Chrome extension was not connected. Screen fixes are verified at code level only.

## What was discovered

The most serious problems found, all now fixed:

1. **Money and stock**
   - A wrongly sized payment left stock reserved and orders pending forever.
   - A returned parcel refunded nothing.
   - Starting a second checkout could cancel one the buyer was paying.
   - Claims were marked resolved even when the refund failed.
   - Supplier stock edits could overwrite reservations, which allows overselling.
2. **Lost or false communication**
   - The contact form discarded messages, including privacy requests.
   - Buyers and suppliers never saw any notifications.
   - Many events notified nobody.
   - Every workspace page claimed it showed "sample data".
3. **Security**
   - The site could be framed by other sites.
   - A signed-in session alone could change the password.
   - Mail scanners could use up confirmation links.
   - Buyers could play the test courier on their own orders.
   - The admin screens ignored sub-roles.
4. **Broken or misleading flows**
   - COD orders could not be cancelled.
   - Quote comparison totalled a different quantity than the buyer paid.
   - Refund forms offered more than had been paid online.
   - Proofs could be sent before any artwork.
   - Admin settings accepted values that broke checkout.
5. **Missing operations tools**
   - No user management, admin order detail, search, paging, refund retry, product take-down, support inbox or audit filters.
6. **Public site**
   - Placeholder legal names showed on every page, and the privacy copy was outdated.
   - The home page showed invented promotions.
   - There was no SEO (sitemap, robots, Open Graph), and images were unoptimized.

## What was fixed, added or redesigned

- **Database (4 new migrations, 20 new tests):**
  - mismatched-payment release
  - open-payment protection
  - custom-order cancel window
  - returned-parcel refund and restock
  - out-of-order tracking events
  - notifications across all stakeholders (`notify_admins`, `notify_supplier`, status-history triggers)
  - amounts in pesos in error messages
  - refund-pending claims and refund re-issue
  - optimistic stock edits
  - artwork before proof
  - settings range checks
  - parent-category commission
  - invite cap and role revoke
  - contact messages
  - `order_for_selection`
  - storage rules
- **Auth:**
  - email links land on `/auth/continue` and verify only on POST
  - password reset requires the link
  - resend confirmation
  - Terms and Privacy consent at sign-up
  - the destination page survives sign-up
- **Buyer:**
  - notification center and action-needed dashboard
  - correct cancel and refund rules
  - pay links through the payment adapter
  - COD estimate
  - accurate quote totals
  - claim types by item
  - saved items by id
  - sign-in redirect from the cart
- **Supplier:**
  - work queue and next-step order tabs
  - payout eligibility and on-hold amounts
  - correct "you receive"
  - claim refund cap
  - controls gated by verification
  - document links
- **Admin:**
  - role-aware navigation and buttons
  - user management
  - order detail page
  - search and paging on every finance list
  - refund retry and re-issue
  - payout warnings
  - correct ledger sign
  - product take-down and preview
  - supplier, product and RFQ queues
  - validated settings with units
  - search synonyms
  - contact inbox
  - audit filters
  - work-queue overview
- **Public:**
  - truthful legal copy
  - working contact form
  - cart link
  - marketplace filters in the URL
  - better supplier search
  - product save and compare
  - sitemap, robots and Open Graph
  - optimized images
  - real 404s
  - accessibility fixes (skip link, active nav)
  - public error page
  - mobile composer fix

## What remains

**Needs your decision `[?]`:**
- **D-9:** delete `legacy/` once PARITY.md is complete.
- **D-13:** refund policy when a returned parcel holds custom-made goods (currently kept by the supplier).
- **S-5:** what happens to a suspended supplier's paid orders in progress.
- **S-16:** whether RFQ-deal orders are always "custom" (proof required).
- **S-21:** whether quote payment terms are allowed when checkout is always 100% online.
- **B-5 / S-22:** messages on catalog orders (not only RFQs).
- **S-9:** whether suppliers must answer invites within N hours.
- **A-23:** whether support may post in RFQ threads.
- **P-19:** directed RFQs to a chosen supplier.
- **P-2:** real registered business name, DPO name and DPO email for `lib/site.ts`. The placeholders are hidden until then.

**Blocked `[!]`:**
- **D-8:** Playwright end-to-end tests need the package and a browser download (your approval).
- **S-19:** courier cancel and rebook need the Ninja Van API (business permit).

**Not done yet `[ ]`:**
- **A-20:** MFA reset for admins.
- **S-24:** pause a live listing.
- **P-22:** catalog caching.
- **R-4:** move the admin RFQ queue to database paging.
- **R-5:** RFQ threads in the admin inbox.

**Before any hosted deploy:**
- Set the hosted Supabase auth settings to match `supabase/config.toml`: email confirmation, password rules, templates, Site URL and redirect URLs.
- Apply the migrations with your approval.
- Fill `lib/site.ts`.
- Wire PayMongo and Ninja Van after the permit.
- Add Sentry: the public error page only logs to the console for now.
