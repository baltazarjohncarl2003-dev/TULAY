# AGENT_PLAN

Source: `AUDIT_REPORT.md` (2026-11-13, commit `ad3fa71`). Item numbers below (#1 to #42) refer to its "Actionable Improvements".

## Ground rules

- **Each file has exactly one owner per wave.** The ownership table at the end is the source of truth. If an agent needs a file it does not own, it stops and reports.
- **Workers** are `tulay-coder` agents with effort `high`. The model is Haiku 5.5 per `CLAUDE.md` §1, or Sonnet if the owner overrides it for this run (open question Q4).
- **Every brief includes the `CLAUDE.md` §6 worker rules**, plus the exact interfaces copied in full. At spawn time, the master expands each workstream below into a full §4 brief.
- **Acceptance for every worker:** `npm run typecheck && npm run lint && npm test` pass, plus the specific checks listed for that workstream. The master re-runs them and reads the diff (§5).
- **Workers do not commit.** The master commits after each wave.

## Open questions for the owner (block the items named)

| # | Question | Blocks |
| --- | --- | --- |
| Q1 | Is the 49-category hierarchy in `lib/demo/data.ts:18-70` the real launch list for the database? | #1 |
| Q2 | Should first-time sign-up stay open on the email-code endpoint, and should we turn on captcha (hCaptcha or Turnstile, which needs a site key)? | #3 |
| Q3 | Should "Reply within 24 business hours" become an admin setting (new migration), or should the line be removed for now? | #7, part of it |
| Q4 | Which model should workers use: Haiku (per `CLAUDE.md`) or Sonnet (per this pipeline request)? | All of Wave 1 and Wave 2 |

## Wave 0: master only (before any worker starts)

These items touch auth, migrations, RLS, money helpers, or need verification first. The master writes them per `CLAUDE.md` §3.

| Step | Item | Files |
| --- | --- | --- |
| M1 | Verify H3: run `npm run build && npm start`, then `curl` `/marketplace` and `/search?q=…` to see whether listings are in the server HTML. Pick the #37 design and write it into the Agent-Catalog and Agent-Search briefs. If the listings are already streamed, drop #37. | none |
| M2 | #11 and #9 and #8: add `centavosToInput(c: number): string` (integer-only, moved from `quote-form.tsx:14`) and `formatDate`/`formatDateTime` in `Asia/Manila`; delete `quoteKnownTotal` and update its callers (`rfq-detail.tsx:193`, `rfq-detail-client.tsx:35`) to `compareQuotes`. Fix `docs/frontend-brief.md:29`. Add unit tests. | `lib/format.ts`, `lib/quotes.ts`, `components/rfq-detail.tsx`, `components/rfq-detail-client.tsx` (call site only), `docs/frontend-brief.md`, `lib/*.test.ts` |
| M3 | #7 helper: `getSetting(key)` / `getSettings(keys)` in `lib/data/settings.ts`, read on the server. Replace the literals at `app/(public)/returns/page.tsx:19-21,27`. | `lib/data/settings.ts`, `app/(public)/returns/page.tsx` |
| M4 | #1 (after Q1): new migration seeding the categories, and update the pgTAP count. Load categories from the database into `profile-form.tsx`, `profile/page.tsx:60` and `settings-client.tsx:105`. Also fix the label `for` mismatch in `settings-client.tsx:72-75` (#31). | `supabase/migrations/<new>.sql`, `supabase/tests/database/foundation.test.sql`, `app/(supplier)/supplier/profile/{profile-form,page}.tsx`, `app/(admin)/admin/settings/settings-client.tsx`, `lib/data/categories.ts` |
| M5 | #16: validated same-site `next` path, plus #23 and #35 copy and heading fixes on login. Then #3 (after Q2): rate limits for sending codes. | `lib/auth.ts`, `app/(auth)/login/{actions.ts,login-client.tsx}`, `supabase/config.toml` |
| M6 | #4, #5 (function side), #14: new migration with per-key bounds on settings, required documents before "verify", and the RLS tightening. Plus #10: pgTAP tests for all of them and for the storage policies, role grants and anon column grant. | `supabase/migrations/<new>.sql`, `supabase/tests/database/*.sql`, `lib/action-result.ts` (23505 message) |
| M7 | #6 (orphan uploads, upload cap) and #40 (page the review list, sign only the opened application). | `app/(supplier)/supplier/profile/document-upload.tsx`, `lib/data/admin.ts`, migration from M6 |

**Status (2026-11-13):**
- **M1 done.** The build showed `/marketplace`, `/search` and `/suppliers` as fully static with no listings in the HTML. They now await `searchParams` in an async child, and the server HTML has 12 products, the filtered result and 12 suppliers. #37 is removed from Wave 2.
- **M2 done.** Added `centavosToInput`, plus `date`, `dateTime` and `todayManila` in Asia/Manila time. `quoteKnownTotal` now goes through `compareQuotes`, so its callers did not change. All three float prefills are fixed, and the audit page uses `dateTime`. #11 is removed from Agent-Forms, and #9 from Agent-AdminUI.
- **M3 done.** Added `getNumberSettings` in `lib/data/settings.ts`, and the returns page reads its windows from it.
- **M5 #16 done.** The proxy sets `x-tulay-path`, `requireRole` redirects to `/login?next=…`, and `verifyCode` honours `safeNextPath`. The login `h2` and the old "custom print and packaging" copy are fixed.
- **Blocked:** M4 (Q1) and M5 #3 (Q2).
- **Deferred:** M6 and M7. Docker is not installed on this machine, so `supabase db reset` and `supabase test db` cannot run, and those changes cannot be verified.

M1 to M3 must land before Wave 1. M4 to M7 can run while the workers work, because the table keeps the files apart.

## Wave 1: parallel workers

### Agent-Shell (header, layout, theme)
- **Scope:** `components/site-header.tsx`, `components/header-search.tsx`, `components/mega-menu.tsx`, `app/layout.tsx`, `app/globals.css`.
- **Tasks:**
  1. #25 / H6: add a phone menu button (shadcn `Dialog` or a sheet built from `components/ui/dialog.tsx`, no new dependency). It exposes `PUBLIC_NAV` plus the utility links. On the bottom bar, Messages and Account go to `/login` when signed out, or to the role's home when signed in. Add `aria-current="page"` on the active item.
  2. #18: the header takes the session user (server-side, via `getSessionUser()`) and shows the role's own Messages and Account links. Signed out, it shows "Sign in" and "Create account".
  3. #28: define `--header-h` on `:root` in `globals.css` (one value for phones, one from `md` up), measured from the final header classes. Export the class name `top-[var(--header-h)]` in the report so other agents can use it.
  4. #32: a skip link "Skip to content" as the first child of `<body>`, targeting `#main`. Each page's `<main>` gets `id="main"` through `PageHeader` or the layouts (the Agent-UIKit brief adds the id to `PageHeader`).
  5. #24: give `--destructive` its own red that passes 4.5:1 contrast on white. Set `<Toaster theme="light" />` in `app/layout.tsx`.
  6. #23 and #42: change the metadata description in `layout.tsx:18` to general B2B, and remove the unused `Geist_Mono`.
  7. #38 and #36: `header-search.tsx` and `mega-menu.tsx` take categories as props from `site-header.tsx` instead of importing `lib/demo/data`. In the mega-menu, top-level items open their subcategory panel with the arrow keys or Enter, so keyboard users do not have to tab through all 12. #30: give the search scope tabs at least 36 px of height.
  8. #19 (footer only): hide the support-email line when `SITE.supportEmail` still contains `[`.
- **Acceptance:** the three checks pass. `grep -n "lib/demo" components/header-search.tsx components/mega-menu.tsx` returns nothing. At 360 px every `PUBLIC_NAV` item can be reached from the menu. Tab on any page focuses the skip link first.

### Agent-UIKit (shared primitives)
- **Scope:** `components/ui/dialog.tsx`, `components/form.tsx`, `components/common.tsx`, `components/product-card.tsx`, `components/ui/table.tsx`, `components/ui/label.tsx`, and delete `components/ui/checkbox.tsx`.
- **Tasks:**
  1. #27: add `max-h-[calc(100dvh-2rem)] overflow-y-auto` to the dialog popup.
  2. #31: in `Field`, use `useId()` for an error id and pass `aria-invalid` and `aria-describedby` to the child control (clone the element, or take the id through a render prop; the master picks one in the brief). #30: make `NativeSelect` `text-base md:text-sm`.
  3. #35: `EmptyState` takes `as?: "h2" | "h3"`, defaulting to `"h2"`. `PageHeader` renders the `id="main"` anchor (coordinated with Agent-Shell).
  4. #34: add a visible `focus-visible:ring` on the product card link. #41: move only the compare button into a small client child, so `product-card.tsx` becomes a Server Component.
  5. #41: remove `"use client"` from `table.tsx` and `label.tsx`, but only if typecheck and build still pass. If either fails, keep the directive and report it.
  6. #13: delete `checkbox.tsx` after confirming with `grep -rn "ui/checkbox"` that nothing imports it.
- **Acceptance:** the three checks pass. A test in `components/form.test.tsx` is not possible without RTL (not installed, no new dependencies), so instead the master greps `aria-describedby` in the rendered output of one form during the build. The worker does not add test libraries.

### Agent-Errors (new files only)
- **Scope (all new):** `app/error.tsx`, `app/global-error.tsx`, `app/not-found.tsx`, `app/(public)/loading.tsx`, `app/(buyer)/buyer/loading.tsx`, `app/(supplier)/supplier/loading.tsx`, `app/(admin)/admin/loading.tsx`.
- **Tasks:** #17. `error.tsx` is a client component with a "Try again" button calling `reset()`, plus a link home. It never shows `error.message` to the user. `not-found.tsx` uses `EmptyState` (the current signature; the `as` prop arrives in the same wave, so leave it at the default) and links to `/marketplace` and `/`. The loading files show a short skeleton made from existing Tailwind classes, with `aria-busy="true"` and visible text "Loading…".
- **Acceptance:** the three checks pass. `npm run build` passes. Visiting `/products/does-not-exist` shows the site's own 404 inside the site header.

### Agent-WorkspaceBuyerAdmin
- **Scope:** `components/buyer-dashboard.tsx`, `components/dashboard-overview.tsx`, `components/messages-list.tsx`, `app/(buyer)/buyer/messages/page.tsx`, `components/role-guard.tsx`.
- **Tasks:** #2: `RoleGuard` already has the session user. Pass `displayName` down. The buyer dashboard and admin overview greet that name, falling back to "there". #13: delete the unused buyer and supplier branches in `dashboard-overview.tsx` and `messages-list.tsx` (they only render with `role="admin"`). Put a visible "Sample data" badge (`components/ui/badge.tsx`) at the top of the buyer inbox.
- **Acceptance:** the three checks pass. `grep -n "DEMO_USERS\|Alex\|Jun" components/buyer-dashboard.tsx components/dashboard-overview.tsx` returns nothing.

### Agent-WorkspaceSupplier
- **Scope:** `app/(supplier)/supplier/products/page.tsx`, `app/(supplier)/supplier/invites/page.tsx`, `app/(supplier)/supplier/auto-matching/page.tsx`, `components/supplier-dashboard.tsx`, `app/(supplier)/supplier/messages/page.tsx`.
- **Tasks:** #2: take status from `getMyApplication()` (`lib/data/supplier.ts`, signature copied into the brief) instead of `DEMO_SUPPLIER.status`. Disable the product form and show the pill using the real status. Put a "Sample data" badge on each demo card in `supplier-dashboard.tsx:110-187` and on the inbox. #7: wait for the answer to Q3 before changing the "24 business hours" line. If Q3 is unanswered, leave it alone.
- **Acceptance:** the three checks pass. `grep -n "DEMO_SUPPLIER.status" app/(supplier)` returns nothing.

### Agent-AdminUI
- **Scope:** `app/(admin)/admin/products/page.tsx`, `app/(admin)/admin/suppliers/supplier-review-buttons.tsx`, `app/(admin)/admin/audit/page.tsx`, and the four `[id]/page.tsx` files listed in #39.
- **Tasks:** #29: add `whitespace-normal` to the description cell. #24: Reject, Suspend and Restrict use `variant="destructive"`. #35: give the reject textarea a visible `<Label>`. #5 (UI side): when there are no documents, the Verify button shows a warning and stays disabled (the function check comes in M6). #9: format audit times with `formatDateTime` from M2. #39: remove `generateStaticParams` from `buyer/rfqs/[id]`, `supplier/rfqs/[id]`, `supplier/rfqs/[id]/quote` and `admin/rfqs/[id]`.
- **Acceptance:** the three checks pass, and so does `npm run build`. Those routes no longer appear as SSG in the build output.

### Agent-PublicHome
- **Scope:** `app/(public)/page.tsx`, `app/(public)/home-carousel.tsx`, `app/(public)/how-it-works/page.tsx`, `app/(public)/contact/page.tsx`, `app/(public)/contact/contact-form.tsx`.
- **Tasks:** #19: disable the contact form, and show a plain notice ("Not connected yet. Email us at …" when the email is set, otherwise "coming soon"). Hide placeholder values. #21: use `PageHeader` with the same `<main>` padding as the rest; sign-up links go to `/register`. #23: work out the "12 categories" count from data. #36: no nested labelled sections in the carousel; announce the slide title, not just the counter. #38: the carousel takes its banners as props. #31: link the contact checkbox error to the checkbox.
- **Acceptance:** the three checks pass. `grep -n "\[support" app/(public)` matches nothing visible.

### Agent-PublicDetail
- **Scope:** `app/(public)/products/[id]/page.tsx`, `app/(public)/suppliers/[id]/page.tsx`, `app/(public)/categories/page.tsx`.
- **Tasks:** #20: keep one "Request a quote" button, and on the supplier page pass `?supplier=<id>`. Before using that param, check `rfq-form` reads it, and if it does not, report back without wiring it. #28: replace `top-32`/`scroll-mt-32` with `top-[var(--header-h)]`/`scroll-mt-[var(--header-h)]`. #35: make `Row` a `<div><dt/><dd/></div>`. #21: give `categories/page.tsx` a `<main>` and `PageHeader`.
- **Acceptance:** the three checks pass. `grep -n "top-32\|scroll-mt-32"` on these three files returns nothing.

## Wave 2: after M1 and M2, and once Wave 1 has merged

### Agent-Catalog
- **Scope:** `app/(public)/marketplace/page.tsx`, `app/(public)/marketplace/marketplace-client.tsx`.
- **Tasks:** #37 using the design chosen in M1. #22: filters, sort and page live in the URL (`router.replace` with `scroll: false`), and the breadcrumb is a real link. #33: arrow-key roving tabindex on the tablist; category buttons get `aria-pressed` only; remove the duplicate hidden paragraph. #11: replace the peso parsing with `toCentavos`. #28: sticky panels use `top-[var(--header-h)]`. #21: use the shared `h1` style.
- **Acceptance:** the three checks pass, and so does the build. Opening `/marketplace?category=packaging&sort=price` restores those filters, and Back restores the previous ones.

### Agent-Search
- **Scope:** `app/(public)/search/page.tsx`, `app/(public)/search/search-client.tsx`, `app/(public)/suppliers/page.tsx`, `app/(public)/suppliers/suppliers-client.tsx`, `app/(public)/compare/page.tsx`.
- **Tasks:** #26: example chips get `h-auto whitespace-normal text-left`. #37 using the design from M1. #23: show quantities with `qty()`. #21: use `PageHeader`; the sign-up link goes to `/register`.
- **Acceptance:** the three checks pass. At 360 px, `/search` does not scroll sideways.

### Agent-Forms
- **Scope:** `app/(buyer)/buyer/rfqs/new/rfq-form.tsx`, `app/(supplier)/supplier/products/product-form.tsx`, `components/rfq-detail-client.tsx`, `app/(supplier)/supplier/rfqs/[id]/quote/quote-form.tsx`, `components/quote-comparison.tsx`.
- **Tasks:** #11: every money prefill uses `centavosToInput` from M2, and no `/ 100` remains. #12: one delivery label map, exported from `quote-comparison.tsx`; one `categoryLabel`; product units come from `unitSchema.options`. #7: the RFQ daily limit comes in as a prop from the page, using `getSetting` from M3 (the page file is added to scope in the brief). #31: link the checkbox errors to their checkboxes. #9: `quote-form.tsx` dates use `Asia/Manila`. #13: remove the empty comment at `quote-form.tsx:17`.
- **Acceptance:** the three checks pass. `grep -n "/ 100" ` on these files returns nothing. Existing quote and RFQ tests still pass.

## Not in this plan (deliberately)

- **#12, banner themes:** this needs a shared constant across Agent-PublicHome and an admin file. Skipped as Low.
- **#15, moving types out of `lib/demo`:** a wide mechanical refactor that would collide with every wave. Do it alone afterwards.
- **#30, global button sizes:** changes every screen, so it needs a design decision from the owner.
- **#42, the rest:** image host list (no images yet), double profile query, and the `vitest.config.mts` rename. The master does the rename at the final gate.

## Final gate (master)

1. Run `npm run typecheck && npm run lint && npm test && npm run build`.
2. Because of M4 and M6, also run `supabase db reset && supabase test db`.
3. Check by hand at 360 px and 1280 px: home, marketplace, search, product, login, buyer dashboard, supplier products.
4. Make one commit per wave on `main`, then write a summary of what changed, what is stubbed and what is still open.

## File ownership (Wave 1 and Wave 2 together; no file appears twice)

| Owner | Files |
| --- | --- |
| Master | `lib/format.ts`, `lib/quotes.ts`, `lib/data/settings.ts`, `lib/data/categories.ts`, `lib/data/admin.ts`, `lib/auth.ts`, `lib/action-result.ts`, `components/rfq-detail.tsx`, `app/(public)/returns/page.tsx`, `app/(auth)/login/*`, `app/(supplier)/supplier/profile/*`, `app/(admin)/admin/settings/*`, `supabase/**`, `docs/frontend-brief.md` |
| Shell | `components/site-header.tsx`, `components/header-search.tsx`, `components/mega-menu.tsx`, `app/layout.tsx`, `app/globals.css` |
| UIKit | `components/ui/{dialog,table,label,checkbox}.tsx`, `components/form.tsx`, `components/common.tsx`, `components/product-card.tsx` |
| Errors | new `error`/`global-error`/`not-found`/`loading` files |
| WorkspaceBuyerAdmin | `components/{buyer-dashboard,dashboard-overview,messages-list,role-guard}.tsx`, `app/(buyer)/buyer/messages/page.tsx` |
| WorkspaceSupplier | `app/(supplier)/supplier/{products/page,invites/page,auto-matching/page,messages/page}.tsx`, `components/supplier-dashboard.tsx` |
| AdminUI | `app/(admin)/admin/products/page.tsx`, `.../suppliers/supplier-review-buttons.tsx`, `.../audit/page.tsx`, the four `rfqs/[id]` pages |
| PublicHome | `app/(public)/{page,home-carousel}.tsx`, `how-it-works/page.tsx`, `contact/*` |
| PublicDetail | `app/(public)/products/[id]/page.tsx`, `suppliers/[id]/page.tsx`, `categories/page.tsx` |
| Catalog (W2) | `app/(public)/marketplace/*` |
| Search (W2) | `app/(public)/search/*`, `suppliers/page.tsx`, `suppliers/suppliers-client.tsx`, `compare/page.tsx` |
| Forms (W2) | `rfq-form.tsx` (+ its `page.tsx`), `product-form.tsx`, `components/rfq-detail-client.tsx`, `quote-form.tsx`, `components/quote-comparison.tsx` |

`components/rfq-detail-client.tsx` is touched by the master in M2 (one call site) and then by Agent-Forms in Wave 2. The two edits happen one after the other, never at the same time.
