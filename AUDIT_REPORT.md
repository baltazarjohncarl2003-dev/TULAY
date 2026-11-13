# AUDIT_REPORT

Read-only audit, 2026-11-13, commit `ad3fa71` on `main`. Scope: `app/`, `components/`, `lib/`, `proxy.ts`, `next.config.ts`, `supabase/migrations`, `supabase/tests`. Nothing was edited except this file.

How to read the evidence: every finding cites code that was read. Layout findings (overflow, sticky offsets, clipped dialogs) are worked out from the class names, not from a rendered page, because no dev server or browser was run. They are marked "(from classes)".

Totals: 42 items. Critical 1, High 7, Medium 22, Low 12. Nine are MASTER-ONLY.

## Check results (typecheck/lint/test output summary)

| Check | Result |
| --- | --- |
| `npm run typecheck` (`next typegen && tsc --noEmit`) | Pass, no errors |
| `npm run lint` (`eslint`) | Pass, no errors or warnings |
| `npm test` (`vitest run`) | Pass: 10 files, 58 tests, 2.3 s |
| `supabase test db` | Not run (needs the local Supabase stack). `supabase/tests/database/foundation.test.sql:4` plans 47 assertions |

- Vitest prints one warning: `vitest.config.ts:1` uses ESM syntax in a file loaded as CommonJS, which a future Vite major will reject. Rename to `vitest.config.mts` when convenient.
- All three checks are green, so none of the findings below is caught by the current gate. The gate has no test for any page, component or Server Action; the 58 tests cover `lib/` helpers and one price filter.

## Critical Findings (bugs, broken layouts, high-priority UX, rule violations)

### C1. Critical, MASTER-ONLY: category lists disagree, so live supplier applications and commission steps fail

- The database seeds 14 categories (`supabase/migrations/20261109141047_foundation.sql:150-170`). The UI offers 49 from demo data (`lib/demo/data.ts:18-70`). Only 14 slugs exist in both.
- `app/(supplier)/supplier/profile/profile-form.tsx:37` lists all 49 in the "Main category" select and posts the slug to `submit_supplier_application`, which raises `Unknown category` for anything not in the table (migration `:319-322`). 35 of 49 choices fail. This is the one live supplier flow.
- `app/(admin)/admin/settings/settings-client.tsx:105` lists the 12 demo top-level categories for a commission step. `lib/actions/admin.ts:44-48` looks the slug up in the database; only `packaging` resolves. The six real top-level categories other than packaging (custom shirts, DTF, and so on) cannot be selected at all.
- Display names also diverge: `app/(supplier)/supplier/profile/page.tsx:60` shows the demo name for a database slug ("Packaging & printing" for the row named "Packaging").
- The owner's 2026-11-11 decision to go general B2B never reached the schema. Fix needs a new migration plus reading categories from the database in both forms.

### H1. High: demo identity and demo state are shown to real signed-in users

- `components/buyer-dashboard.tsx:21` greets every buyer as the demo user ("Welcome back, Alex"). `components/dashboard-overview.tsx:59-60` does the same for admins ("Jun").
- `app/(supplier)/supplier/products/page.tsx:8` and `app/(supplier)/supplier/invites/page.tsx:22` use `DEMO_SUPPLIER.status` ("approved"). A real supplier who is pending or rejected sees an "approved" pill and an enabled product form, while `/supplier` (real data, `components/supplier-dashboard.tsx:27`) shows their true status.
- `components/supplier-dashboard.tsx:34-45` mixes the real application with demo invitations, quotes and listings in one page, including "Review & quote" links.
- `app/(buyer)/buyer/messages/page.tsx:8` and `app/(supplier)/supplier/messages/page.tsx:8` show the demo account's conversations.
- The only warning is one dashed line in `components/workspace-shell.tsx:77-79`.

### H2. High, MASTER-ONLY: the email-code sender has no app-level limits

- `app/(auth)/login/actions.ts:10-26` is callable by anyone, creates accounts (`shouldCreateUser: true`) and sends mail.
- `supabase/config.toml:220` says the per-email limits (4 per hour, 12 per day, failed-verify caps) "are enforced in the app, Stage 1". No such code exists in `app/`, `lib/` or `proxy.ts`.
- What remains is `email_sent = 60` per hour for the whole project (`config.toml:200`) and a commented-out captcha (`config.toml:214-218`). One script can use up the hourly allowance and lock every user out of sign-in. Hosted project limits are not visible from the repo.

### H3. High: the catalog is not in the server HTML

- `next.config.ts:5` turns on `cacheComponents`. The catalog pages wrap a client component that calls `useSearchParams()` in `<Suspense fallback={null}>`: `app/(public)/marketplace/page.tsx:9`, `suppliers/page.tsx:10`, `search/page.tsx:10`, `compare/page.tsx:10`.
- The prerendered page is therefore the header, an empty main area and the footer. Listings appear only after hydration. That costs first paint and gives search engines nothing to index on the two pages that matter most. Not confirmed with a build.
- Same pattern, lower stakes: `app/(auth)/login/page.tsx:9`, `app/(buyer)/buyer/rfqs/new/page.tsx:16`, `app/(public)/contact/page.tsx:18`.

### H4. High: no error, not-found or loading screens anywhere

- There is no `error.tsx`, `global-error.tsx`, `not-found.tsx` or `loading.tsx` in `app/`.
- Every real data loader throws on failure: `lib/data/admin.ts:37,77,90,115`, `lib/data/supplier.ts:40`, `lib/data/account.ts:13`. A database hiccup shows the framework's default error page.
- Six routes call `notFound()` (for example `app/(public)/products/[id]/page.tsx:47`) and get the default 404 with no site header or way back.
- The only loading state is one line of text for the whole workspace (`components/role-guard.tsx:15`).

### H5. High: signing in loses where the visitor was going

- `lib/auth.ts:41` redirects to `/login` with no return address, and `app/(auth)/login/actions.ts:40` always lands on the role home.
- "Request a quote" style links point at `/buyer/rfqs/new` in 18 places (for example `components/site-header.tsx:59`, `components/supplier-card.tsx:84`, `app/(public)/products/[id]/page.tsx:130`). A visitor who clicks one, signs in, and arrives at `/buyer` has lost the product prefill (`?product=`) and the page they wanted.
- A signed-in supplier clicking the same link is silently sent to `/supplier` (`lib/auth.ts:43`).

### H6. High: phones cannot reach most of the public navigation

- Below `md` the utility bar and main nav are hidden (`components/site-header.tsx:31`, `:67`) and nothing replaces them. Suppliers, TULAY AI, Services, How it works, Sign in, Create account and Sell on TULAY are reachable only from the footer.
- The bottom bar (`components/site-header.tsx:83-89`) sends anonymous visitors to `/buyer/messages` and `/buyer`, which redirect to login. It has no current-page state.
- The sticky header is about 134 px tall on phones (logo row `h-16` plus the search block, `site-header.tsx:43`, `:64`) and the bottom bar is 64 px, so roughly 30% of a 640 px screen is fixed chrome (from classes).

### H7. High: TULAY AI example chips overflow at 360 px

- `app/(public)/search/search-client.tsx:93` renders each example prompt as a `Button`. `components/ui/button.tsx:6` sets `whitespace-nowrap`. The longest prompt is about 75 characters (`search-client.tsx:22`), roughly 480 px at this size against 328 px of available width, so the page scrolls sideways (from classes).

### Rule violations confirmed (CLAUDE.md section 7)

- Rule 7, hardcoded business values while the settings exist in `platform_settings`:
  - Report windows 5/30/60 days: `app/(public)/returns/page.tsx:19-21`, `:27` (settings at migration `:231-233`).
  - "Max 5 RFQs per day": `app/(buyer)/buyer/rfqs/new/rfq-form.tsx:428` (setting at migration `:237`).
  - "Reply within 24 business hours": `components/supplier-dashboard.tsx:136` (no setting exists).
  - Reply times "2 business days" and "15 working days": `app/(public)/contact/page.tsx:16`, `:38`.
- Rule 2, float arithmetic on money: three form prefills use `(centavos / 100).toFixed(2)`: `rfq-form.tsx:92`, `app/(supplier)/supplier/products/product-form.tsx:96`, `components/rfq-detail-client.tsx:65`. An integer-only version already exists at `app/(supplier)/supplier/rfqs/[id]/quote/quote-form.tsx:14`. `docs/frontend-brief.md:29` explicitly told workers to use the float form, so the brief contradicts CLAUDE.md.
- Rule 3, RLS: all nine tables have RLS enabled (migration `:523-531`). No table is missing it.
- Rule 1 and Zod: every Server Action validates with `parseInput` before touching the database (`lib/actions/*.ts`, `app/(auth)/*/actions.ts`). Status and eligibility decisions on the RFQ page are computed in Server Components (`components/rfq-detail.tsx:197-200`). No violation found.

## Insights (architectural or design bottlenecks)

1. **Two domain models run side by side.** Real paths use database types (`lib/data/supplier.ts:7`, status `verified`). Demo paths use `lib/demo/types.ts:7` (status `approved`). `components/common.tsx:35` maps both to the same pill, which hides the split. C1 and H1 are both symptoms. Until categories, suppliers and products have one source, every screen that becomes real will hit the same seam.
2. **`lib/demo/data.ts` is a dependency hub, including for client code.** Eleven client components import it at runtime, among them `components/header-search.tsx:8` and `components/mega-menu.tsx:7`, which load on every public page. The whole sample dataset ships in the shared browser bundle, and the catalog pages also pass it as props (`marketplace/page.tsx:10`). Swapping to database queries means touching each of these files, not one data layer.
3. **Shared money and format helpers depend on demo types.** `lib/format.ts:1` and `lib/quotes.ts:1` import `Quote` from `lib/demo/types`. Real-path components do the same (`components/account-form.tsx:11`, `lib/data/account.ts:4`, `components/workspace-shell.tsx:9`). Code used on real paths also lives under `lib/demo/` (`supplier-stats.ts`, `saved.ts`).
4. **Role checks live in layouts; pages inside them have none.** `components/role-guard.tsx:6` guards each workspace. The real admin loaders re-check (`lib/data/admin.ts:31`), which is the right pattern. The demo pages (`admin/products`, `admin/rfqs`, `admin/transactions`, all buyer and supplier pages) rely on the layout alone. Each one needs its own loader check when it gets real data.
5. **Settings are stored but nothing reads them.** `platform_settings` has nine values and an admin editor, yet no page or action reads one. There is no `getSetting` helper, so the hardcoded numbers above have nowhere to come from yet. `admin_update_setting` also accepts any non-negative integer for any key (migration `:459-482`).
6. **No shared page frame.** Each public page sets its own `<main>` width, padding and `h1` style: `py-4`, `py-6`, `py-10`, `py-12` and four different `h1` classes across `app/(public)/*`. `PageHeader` (`components/common.tsx:4`) exists but only workspace pages and three public pages use it.
7. **The form layer has one accessibility gap that repeats everywhere.** `Field` (`components/form.tsx:110-137`) prints the error under the input but cannot link it to the input, so about 20 forms share the same defect. One fix there repairs all of them.
8. **Per-user routes are enumerated at build time.** `generateStaticParams` on `buyer/rfqs/[id]`, `supplier/rfqs/[id]`, `supplier/rfqs/[id]/quote` and `admin/rfqs/[id]` lists demo ids. It is harmless today and wrong the day these read real rows.
9. **What is solid.** The migration is careful: RLS everywhere, column-level grants, MFA-gated admin functions, append-only triggers, audit rows on every state change. `php()` refuses non-integers (`lib/format.ts:6`). Server Actions return one result shape. Tables are wrapped for horizontal scroll. This is a good base; the problems are at the seam between it and the demo layer.

## Actionable Improvements (numbered, prioritized by impact; each with exact file paths, what to change, and severity; group by theme: UI, Responsive, A11y, Perf, Architecture)

### Architecture

1. **Critical, MASTER-ONLY. One category list.** New migration seeding the general B2B categories with the hierarchy in `lib/demo/data.ts:18-70`. Then load categories from the database and pass them as props to `app/(supplier)/supplier/profile/profile-form.tsx:37` and `app/(admin)/admin/settings/settings-client.tsx:105`; use the database name in `app/(supplier)/supplier/profile/page.tsx:60`. Update the count in `supabase/tests/database/foundation.test.sql:31`. See C1.
2. **High. Stop showing demo identity in signed-in workspaces.** Pass the session user's name into `components/buyer-dashboard.tsx:21` and `components/dashboard-overview.tsx:59` (it is already available in `components/role-guard.tsx:6`). In `app/(supplier)/supplier/products/page.tsx:8`, `invites/page.tsx:22` and `auto-matching/page.tsx:15`, take status from `getMyApplication()` instead of `DEMO_SUPPLIER`. Put a visible "Sample data" label on each demo card in `components/supplier-dashboard.tsx:110-187` and on the two inbox pages, rather than one notice at the bottom (`:218`). See H1.
3. **High, MASTER-ONLY. Limit code sending.** In `app/(auth)/login/actions.ts:10`, add the per-email and per-IP limits that `supabase/config.toml:220` promises, and enable a captcha (`config.toml:214-218`). Decide whether sign-up should stay open on the same endpoint. See H2.
4. **Medium, MASTER-ONLY. Bound each setting.** `admin_update_setting` (migration `:459-482`) lets `cod_downpayment_bps` exceed 10000 and `payout_delay_days` be 0 or 999999999999 (`lib/actions/admin.ts:31` allows 12 digits). Add a per-key minimum and maximum in a new migration.
5. **Medium, MASTER-ONLY. Do not allow "Verify" with no documents.** `admin_set_supplier_status` (migration `:353-391`) has no document check, and `app/(admin)/admin/suppliers/supplier-review-buttons.tsx:57-61` enables the button when `documents.length === 0` (`suppliers/page.tsx:52`). Enforce the four required kinds in the function, or at least warn in the UI. The required list is duplicated in `lib/demo/supplier-stats.ts:1` and `app/(auth)/register/page.tsx:12`.
6. **Medium, MASTER-ONLY. Document upload leaves orphans and has no cap.** `app/(supplier)/supplier/profile/document-upload.tsx:41-52` uploads to storage first, then records the row. If the second step fails the file stays forever, because storage has no delete policy (migration `:605`). The insert policy (migration `:569-573`) also allows unlimited 10 MB files in any supplier status.
7. **Medium. Read business values from settings.** Add a small server helper over `platform_settings`, then replace the literals at `app/(public)/returns/page.tsx:19-21,27`, `app/(buyer)/buyer/rfqs/new/rfq-form.tsx:428` and `components/supplier-dashboard.tsx:136`. The 24-hour reply rule needs a new setting, which is a MASTER-ONLY migration and an owner decision.
8. **Medium. One quote total.** `quoteKnownTotal` (`lib/format.ts:28`) uses the quoted quantity and base price. `compareQuotes` (`lib/quotes.ts:34`) uses the buyer's quantity and price tiers. Both appear on the same page (`components/rfq-detail.tsx:193` and `:272`, plus `components/rfq-detail-client.tsx:35`), so a tiered quote can show two different totals. Keep `compareQuotes` and delete the other.
9. **Medium. Dates are cut in UTC.** `lib/format.ts:24` slices the ISO string, and `app/(admin)/admin/audit/page.tsx:35` prints UTC hours. Anything after 16:00 UTC shows the previous day for Philippine users. Format in `Asia/Manila`, as `components/rfq-detail.tsx:183` already does for "today". `quote-form.tsx:28-32` uses the browser's zone instead; align it.
10. **Medium, MASTER-ONLY. Database test gaps.** `supabase/tests/database/foundation.test.sql` has no test for the storage policies (migration `:606-625`), `admin_grant_role` and `admin_revoke_role`, the anon column grant on `suppliers` (`:516-517`), or append-only on `supplier_documents`.
11. **Low. One centavos-to-input helper.** Move `tierPesos` from `quote-form.tsx:14` into `lib/format.ts` and use it at `rfq-form.tsx:92`, `product-form.tsx:96` and `rfq-detail-client.tsx:65`. Fix `docs/frontend-brief.md:29`. Also `app/(public)/marketplace/marketplace-client.tsx:67` re-implements peso parsing next to `toCentavos`.
12. **Low. Remove duplicated labels and helpers.** Delivery labels: `rfq-form.tsx:56`, `quote-form.tsx:19`, `components/quote-comparison.tsx:11`. `categoryLabel`: `rfq-form.tsx:176`, `product-form.tsx:22`, `profile-form.tsx:13`. Units: `product-form.tsx:15` against `unitSchema` (`lib/validation/forms.ts:28`). Banner themes: `app/(public)/home-carousel.tsx:13` and `app/(admin)/admin/promotions/promotions-client.tsx:39`.
13. **Low. Dead code.** `components/ui/checkbox.tsx` is unused. `components/dashboard-overview.tsx` and `components/messages-list.tsx` are rendered only with `role="admin"`, so their buyer and supplier branches (`dashboard-overview.tsx:9-10,15-24,36-50,79-83`; `messages-list.tsx:13-14`) never run. `quote-form.tsx:17` is a comment with no code under it.
14. **Low, MASTER-ONLY. RLS tightening.** Any signed-in user can read `owner_id` of verified suppliers and every commission note (full-table select grant at migration `:518-519` with policies `:549`, `:551`). Anonymous users can read all setting descriptions, including "OPEN ITEM" notes (`:548`). Only `audit_log` has a truncate guard (`:273`). A duplicate commission step returns error 23505, which `lib/action-result.ts:21` turns into "Something went wrong". Revoking an admin's last sub-role leaves `role = 'admin'` (`:446-457`), so the admin shell still opens with empty data.
15. **Low. Untangle shared code from `lib/demo`.** Move `Quote`, `Profile` and `Role` types out of `lib/demo/types.ts` for `lib/format.ts:1`, `lib/quotes.ts:1`, `lib/data/account.ts:4`; move `lib/demo/supplier-stats.ts` next to `lib/data/supplier.ts`.

### UI

16. **High. Return to the intended page after sign-in.** Add a validated same-site `next` path in `lib/auth.ts:41` and honour it in `app/(auth)/login/actions.ts:40` and `app/(auth)/login/login-client.tsx:37`. MASTER-ONLY because it is the auth flow. See H5.
17. **High. Add `app/error.tsx`, `app/not-found.tsx` and a `loading.tsx` per route group.** Use `EmptyState` and the site header so a failure or a bad id keeps the visitor inside the site. See H4.
18. **Medium. Make the header aware of the session.** `components/site-header.tsx:16-26` always shows "Sign in" and "Create account" and always links Messages and Account to `/buyer/*`. Show the role's own links when signed in.
19. **Medium. Placeholders and a false success on public pages.** `lib/site.ts:5-11` values such as "[support email]" render on `app/(public)/contact/page.tsx:25-27,35-36` and in the footer (`components/site-header.tsx:172-174`). `app/(public)/contact/contact-form.tsx:12` shows "Message sent. We'll reply by email." although nothing is sent, on the form that takes Data Privacy Act requests. Disable the form with a plain notice until it is wired.
20. **Medium. Two buttons, one destination.** "Request a quote" and "Contact supplier" both go to the same RFQ form at `app/(public)/products/[id]/page.tsx:130-135` and `app/(public)/suppliers/[id]/page.tsx:46-54`; the supplier page does not pass the supplier. Remove the second button or give it its own target.
21. **Medium. One page frame.** Standardise `<main>` padding and `h1` through `PageHeader`: `app/(public)/page.tsx:56` (`py-4`), `how-it-works/page.tsx:18` (`py-12`), `search/page.tsx:9` (`py-10`), `marketplace-client.tsx:366` and `categories/page.tsx:25` (`text-xl`), `suppliers-client.tsx:58` (`font-semibold`). `categories/page.tsx:18` has no `<main>`. Sign-up links disagree: `how-it-works/page.tsx:50` and `suppliers-client.tsx:132` go to `/login`, everything else to `/register`.
22. **Medium. Keep marketplace filters in the URL.** `marketplace-client.tsx:241-252` holds filters, sort and page in component state, and the breadcrumb cancels navigation (`:329-333`). Back, refresh and sharing all lose the selection.
23. **Low. Stale copy.** `app/layout.tsx:18` and `app/(auth)/login/login-client.tsx:52` still say "custom print and packaging". `login-client.tsx:56` uses the legacy tagline "Buy smart. Grow big." `app/(public)/page.tsx:19` hardcodes "12 categories". `components/rfq-detail.tsx:269` says "units" instead of the RFQ unit. `search-client.tsx:115` prints a raw quantity without `qty()`.
24. **Low. Destructive actions look like ordinary ones.** `--destructive` equals `--primary` (`app/globals.css:65`, `:80`), and Reject, Suspend and Restrict use the outline style (`supplier-review-buttons.tsx:68-80`, `:108`). `components/ui/sonner.tsx:8` follows the system theme with no theme provider in `app/layout.tsx`, so dark-mode devices get dark toasts on a light site.

### Responsive

25. **High. Give phones a menu.** Add a menu button to `components/site-header.tsx:43-63` exposing `PUBLIC_NAV` and the utility links, and point the bottom bar's Messages and Account (`:87-88`) at login or the right role home. Mark the current item. See H6.
26. **High. Let the example chips wrap.** Add `h-auto whitespace-normal text-left` to the buttons at `app/(public)/search/search-client.tsx:93`. See H7.
27. **Medium. Dialogs cannot scroll.** `components/ui/dialog.tsx:56` centres the popup with no maximum height or overflow, so a tall dialog on a short screen is cut off at both ends. Add `max-h-[calc(100dvh-2rem)] overflow-y-auto`. Most exposed: the counteroffer form (`components/rfq-detail-client.tsx:56-80`) and quick view (`marketplace-client.tsx:692-739`) (from classes).
28. **Medium. Sticky offsets are shorter than the header.** The desktop header is about 141 px (`site-header.tsx:31,43,67`) but sticky panels and anchors use `top-32` or `scroll-mt-32` (128 px): `marketplace-client.tsx:418,565`, `products/[id]/page.tsx:110`, `suppliers/[id]/page.tsx:64,70,83`, `categories/page.tsx:43`. Panels slide under the header by about 13 px. Use one shared header-height value (from classes).
29. **Medium. Admin product description cell.** `app/(admin)/admin/products/page.tsx:46-48` puts 110 characters in a `max-w-xs` box inside a cell that inherits `whitespace-nowrap` (`components/ui/table.tsx:85`), so the text runs past the box into the next column. Add `whitespace-normal` (from classes).
30. **Medium. Small touch targets and iOS zoom.** Default controls are 32 px tall and small buttons 28 px (`components/ui/button.tsx:23,25`, `components/ui/input.tsx:11`). Search scope tabs are `text-xs` with no padding (`components/header-search.tsx:101-114`). `NativeSelect` uses `text-sm` on phones (`components/form.tsx:145`), which makes iOS zoom the page on focus; `Input` already avoids this with `text-base md:text-sm`.

### A11y

31. **Medium. Link errors to their inputs.** In `components/form.tsx:110-137`, give the error an id and set `aria-invalid` and `aria-describedby` on the control. Fix the label mismatch in `settings-client.tsx:72-75`, where the label points at `value` but the input id is the setting key. Checkbox errors at `rfq-form.tsx:388`, `contact-form.tsx:55` and `rfq-detail-client.tsx:112` need the same link.
32. **Medium. Add a skip link.** `app/layout.tsx:23-32` has none, and the public header puts about 25 links before the content.
33. **Medium. Marketplace tabs and filters.** The tablist (`marketplace-client.tsx:376-399`) has no arrow-key support or roving tabindex. Category buttons carry both `aria-pressed` and `aria-expanded` with no controlled region (`:438-439`). The listing-type group has a hidden legend plus a duplicate hidden-from-readers paragraph (`:464-467`), unlike the price group (`:516`).
34. **Low. Card focus indicator.** `components/product-card.tsx:66` removes the outline and shows only an underline on focus. Add a visible ring on the card.
35. **Low. Semantics.** `Row` renders `div > span + strong` inside `<dl>` at `products/[id]/page.tsx:100-106` and `suppliers/[id]/page.tsx:85-94`. Login shows an `h2` before the `h1` (`login-client.tsx:44`, `:67`). `EmptyState` always uses `h3` (`components/common.tsx:59`), skipping a level under an `h1`. The reject dialog's textarea has only an `aria-label` (`supplier-review-buttons.tsx:89-97`).
36. **Low. Menus and carousel.** The mega-menu makes keyboard users tab through all 12 top-level links before any subcategory (`components/mega-menu.tsx:61-78`). `HomeCarousel` nests a labelled section inside another (`app/(public)/page.tsx:146`, `home-carousel.tsx:29`) and announces only the counter, not the slide (`home-carousel.tsx:45`).

### Perf

37. **High. Render the catalog on the server.** Read `searchParams` in the page (as `app/(auth)/register/page.tsx:25-26` already does), filter there, and keep only the interactive controls as client components. At minimum replace `fallback={null}` with a server-rendered first page of results at `marketplace/page.tsx:9`, `suppliers/page.tsx:10`, `search/page.tsx:10`. See H3.
38. **Medium. Keep the dataset out of the browser bundle.** Pass only what each client component needs as props instead of importing `lib/demo/data`: `components/header-search.tsx:8`, `components/mega-menu.tsx:7`, `components/category-icon.tsx:16` (pulled into the client by `components/product-card.tsx:7`), `app/(public)/home-carousel.tsx:7`, `rfq-form.tsx:10`, `rfq-queue-actions.tsx:9`.
39. **Medium. Remove `generateStaticParams` from per-user routes.** `app/(buyer)/buyer/rfqs/[id]/page.tsx:7`, `app/(supplier)/supplier/rfqs/[id]/page.tsx:9`, `app/(supplier)/supplier/rfqs/[id]/quote/page.tsx:15`, `app/(admin)/admin/rfqs/[id]/page.tsx:8`. Keep it for public products and suppliers.
40. **Medium, MASTER-ONLY. Page the supplier review list.** `lib/data/admin.ts:33-44` loads every supplier with all documents and signs a link for every file on each visit. Page it and sign links only for the opened application.
41. **Low. Narrow the client boundaries.** `components/ui/table.tsx:1` and `components/ui/label.tsx:1` are marked `"use client"` but use no hooks. `components/product-card.tsx:1` makes the whole tile a client component for one compare button. `components/workspace-shell.tsx:1` is client-side only for `usePathname` (`:13`).
42. **Low. Smaller items.** `next/image` is used with `unoptimized` at `components/product-card.tsx:50` and `products/[id]/page.tsx:84`, and `next.config.ts` has no image host list; no sample product has an image yet, so this path is untested. `Geist_Mono` is loaded in `app/layout.tsx:11-14` and never used. Account pages query `profiles` twice (`lib/auth.ts:25-29`, then `lib/data/account.ts:12`). `publicProducts()` (`lib/demo/data.ts:470`) does a supplier lookup per product on every call, a pattern that becomes one query per row if copied onto the database.
