# TULAY complete audit checklist

Audit of 2026-11-15. Four Opus 5.5 reviewers read the buyer, supplier/logistics, admin, and public/auth/shared code, and the master reviewed the database layer (all migrations, money, stock, orders, webhooks, RLS). Every item was found by reading the code or curling the running app, never by guessing.

**Status:** `[x]` implemented and verified · `[ ]` not yet implemented · `[!]` blocked by an external dependency · `[?]` needs a business decision

**Priority:** P0 data loss, security, money or a broken core flow · P1 broken or misleading feature · P2 UX or polish with real impact · P3 nice to have

**Type:** Bug · Missing functionality · Incomplete · UI/UX · Architecture · Security · Performance · Feature opportunity

**Verification used:**
- Type check, lint and unit tests (Vitest).
- The pgTAP database suite (`supabase test db`). New tests are in `supabase/tests/database/audit_fixes.test.sql`, and the after_sales and delivery tests were updated.
- curl against the running dev server for auth links, pages and headers.

**How `[x]` was verified (be clear about the limits):**
- Database items: pgTAP tests (314 passing).
- Auth and link flows: curl against the running app.
- Screen items: type check, lint, 90 unit tests, a successful production build, and the master reading the diffs.
- Screens were **not** clicked through in a browser; the Chrome extension was not connected. Treat screen items as verified at code level, not visually.

**Ids:** D = database and cross-platform (master), B = buyer, S = supplier and logistics, A = admin, P = public, auth and shared.

## Database, money and cross-platform workflows

### [x] D-1 · P0 · Bug · Contact form threw messages away
- **Platform:** Public, support
- **Where:** app/(public)/contact/contact-form.tsx:14 (`useDemoForm`), /contact
- **Now:** Before the fix, the form showed "Message sent" and stored nothing. Privacy-rights requests were lost too.
- **Problem:** Customer and Data Privacy Act requests disappeared with no trace.
- **Fix:** New table `contact_messages` with the `submit_contact_message` RPC (anyone may call it; at most 5 messages per email per hour) and support notifications. Support marks messages handled through `admin_handle_contact_message`. Server actions are in lib/actions/contact.ts.
- **Depends on:** A-23 (admin inbox shows them)
- **Acceptance:** Submitting /contact creates a row and a support notification, and the admin can see it and mark it handled.
- **Status note:** The backend is done and type-checked. Wiring the form and the admin list is tracked under P-33 and A-29.

### [x] D-2 · P1 · Bug · Admin promotions and home carousel use sample data
- **Platform:** Admin, Public
- **Where:** app/(admin)/admin/promotions/promotions-client.tsx:61; app/(public)/home-carousel.tsx:8; lib/demo/data.ts
- **Now:** "Banner saved" saves nothing, and the home carousel shows invented campaigns.
- **Problem:** Staff think a campaign is live. Visitors see marketing claims that are not tied to any listing.
- **Fix:** Hide the carousel until a promotions table exists. Make the admin page say "coming soon" instead of offering a fake save.
- **Depends on:** P-5
- **Acceptance:** No fake save remains, and production `/` shows no sample banners.

### [x] D-3 · P0 · Bug · A payment that didn't match its checkout left stock reserved forever
- **Platform:** Buyer, Supplier, Finance
- **Where:** supabase/migrations/20261112121106_delivery.sql:521 (`confirm_payment`)
- **Now:** Fixed in 20261115115052_audit_fixes.sql. The checkout is released (orders cancelled, stock returned) before the payment is parked as `needs_review`, and the buyer and finance are notified.
- **Problem:** Before the fix, stock stayed off sale, orders stayed pending forever, and the RFQ deal could never be paid again.
- **Fix:** Call `private.release_checkout(...,'cancelled',...)` in the mismatch branch.
- **Depends on:** none
- **Acceptance:** DB test: a wrong amount returns `needs_review`, stock goes back to 5, and the checkout and order are cancelled.

### [x] D-4 · P0 · Bug · A parcel returned to the supplier refunded nothing
- **Platform:** Buyer, Supplier, Logistics
- **Where:** `record_tracking_event` (returned branch)
- **Now:** Fixed. A returned parcel puts the stock back. For non-custom items it refunds what was paid online, and the courier webhook sends the refund at once. Buyer, supplier and support are notified.
- **Problem:** Before the fix, a buyer who paid online saw "cancelled" and got no money back unless finance noticed.
- **Fix:** Restock, create the refund, return `refund:<id>` from the function, and have `settleRefund` send it from app/api/webhooks/shipping/route.ts.
- **Depends on:** D-13 (refunds for returned custom items need your decision)
- **Acceptance:** DB test: "returned" creates a pending refund of 25,000 centavos and stock goes back to 5.

### [x] D-5 · P1 · Missing functionality · Custom-order cancellation window was never enforced
- **Platform:** Buyer, Supplier
- **Where:** `cancel_order`; setting `custom_cancel_window_hours`
- **Now:** Fixed. Custom orders can only be cancelled within the window after payment, and the error message names the window.
- **Problem:** Before the fix, a buyer could cancel days later, after the supplier's design work, and the admin setting did nothing.
- **Fix:** Window check in `cancel_order`.
- **Depends on:** Open item "cancellation window 2 or 24 h" (stays an admin setting)
- **Acceptance:** DB test: a custom order paid 25 hours ago cannot be cancelled with the default 24 hours.

### [x] D-6 · P1 · Missing functionality · No way to retry a refund stuck in pending
- **Platform:** Finance
- **Where:** lib/refunds.ts
- **Now:** Fixed in the backend. `retryRefund` (pending) and `reissueRefund` (failed, through `admin_reissue_refund`) exist for finance. Gateway failures notify finance. `settleRefund` skips refunds that were already settled.
- **Problem:** Before the fix, a crash between the database write and the gateway call left a refund pending forever, and that refund also blocked issuing a new one.
- **Fix:** As above. The admin buttons are tracked in A-9.
- **Depends on:** A-9
- **Acceptance:** Finance can retry or re-issue from /admin/payments (UI under A-9).

### [x] D-7 · P1 · Bug · Starting a new checkout cancelled a checkout already being paid
- **Platform:** Buyer
- **Where:** `start_checkout`
- **Now:** Fixed. A pending checkout whose gateway page is already open blocks a new checkout, with a message saying when it expires.
- **Problem:** Before the fix, a buyer could be charged for a cancelled order, and the money then waited for a manual refund.
- **Fix:** Check `payments.provider_ref is not null` before releasing old checkouts.
- **Depends on:** none
- **Acceptance:** DB test: a second checkout while a payment is in progress raises 22023.

### [!] D-8 · P1 · Missing test · No end-to-end tests of sign-up, checkout and fulfilment
- **Platform:** All
- **Where:** no Playwright tests in the repo
- **Now:** Database and unit tests only.
- **Problem:** Breaks in the pages and actions go unnoticed. For example, the confirm-link cookie bug was only found by testing by hand.
- **Fix:** Add one Playwright journey: sign up, confirm via Mailpit, sign in, cart, checkout, fake pay, order paid, supplier ships, delivered.
- **Depends on:** Playwright install (the stack allows it)
- **Acceptance:** `npx playwright test` passes locally against the dev server and Supabase.

### [?] D-9 · P3 · Lean · `legacy/` Apps Script folder
- **Platform:** Repo
- **Where:** legacy/ (17 files); PARITY.md
- **Now:** Kept. PARITY.md says it is deleted only when every row is ported or dropped, with owner approval.
- **Problem:** It adds noise to searches.
- **Fix:** Owner approves the deletion once PARITY.md is complete.
- **Depends on:** Owner
- **Acceptance:** PARITY.md is complete and the folder is removed.

### [x] D-10 · P2 · Bug · Late courier updates moved a shipment's status backwards
- **Platform:** Logistics, Buyer
- **Where:** `record_tracking_event`
- **Now:** Fixed. An older event is kept in the history but no longer overwrites a newer status.
- **Problem:** Before the fix, "in transit" could show again after "out for delivery".
- **Fix:** Compare `occurred_at` with the latest event.
- **Depends on:** none
- **Acceptance:** DB test: a late `picked_up` leaves the status at `out_for_delivery`.

### [x] D-11 · P1 · Missing functionality · Many cross-platform events notified nobody
- **Platform:** All
- **Where:** migrations (deliver, schedule_payouts, claims, reviews, supplier and product decisions)
- **Now:** Fixed in 20261115115828_audit_fixes_2.sql. Notifications now go out for these events:
  - supplier and product decisions, and new applications and listings (to verifiers)
  - deliveries and the start of the payout clock
  - payouts scheduled (supplier and finance)
  - failed delivery attempts
  - claim messages, escalations and return tracking
  - review replies
  - payments needing review (finance)
- **Problem:** Before the fix, the stakeholders did not learn about events they had to act on.
- **Fix:** `private.notify_admins`, `private.notify_supplier`, and triggers on the status-history tables.
- **Depends on:** B-1, S-1 (screens that show notifications)
- **Acceptance:** The DB suite passes, and each event inserts a notification row.

### [x] D-12 · P1 · Bug · User-facing money errors were in centavos
- **Platform:** Buyer, Supplier, Admin
- **Where:** check_cod, accept_claim, admin_create_refund
- **Now:** Fixed. Messages now read like "Refund up to PHP 1,500.00" (`private.php`).
- **Problem:** Before the fix, errors read "500000 centavos".
- **Fix:** Peso helper in SQL.
- **Depends on:** none
- **Acceptance:** Error texts contain "PHP x,xxx.xx".

### [?] D-13 · P2 · Business decision · Refunds when a custom item's parcel is returned
- **Platform:** Buyer, Supplier
- **Where:** `record_tracking_event` (returned branch)
- **Now:** Custom items keep their online payment or COD downpayment (made-to-order goods cannot be resold).
- **Problem:** The policy is not written in CLAUDE.md.
- **Fix:** Owner confirms the rule (keep, partial or full refund).
- **Depends on:** Owner
- **Acceptance:** The rule is recorded in CLAUDE.md and matches the code.

## Buyer platform

**Orders & checkout**

### [x] B-2 · P1 · bug · COD orders cannot be cancelled; Cancel shown when the server will refuse
- **Platform:** Buyer
- **Where:** app/(buyer)/buyer/orders/[id]/page.tsx:411, orders/[id]/cancel-order.tsx:31-32, supabase/migrations/20261115115052_audit_fixes.sql:180-191 (/buyer/orders/[id])
- **Now:** The Cancel button renders only for `status === "paid"`. `cancel_order` accepts 'paid' and 'confirmed', blocks once the proof is approved, and blocks custom orders after `custom_cancel_window_hours`.
- **Problem:** COD ('confirmed') orders can never be cancelled. Custom orders still show Cancel after proof approval or after the window, and the click errors. The dialog promises a "full amount" refund, but COD refunds only `paid_online_centavos`.
- **Fix:** Show CancelOrder for paid or confirmed orders that have no approved proof and, for custom orders, are still inside the window (computed server-side). Show the refund amount and the deadline in the dialog.
- **Depends on:** none
- **Acceptance:** A 'confirmed' COD order shows Cancel and cancels successfully. A custom order with an approved proof shows no Cancel. The dialog states the refund amount.

### [x] B-6 · P2 · missing functionality · No pay link on order detail; fake gateway URL hardcoded
- **Platform:** Buyer
- **Where:** app/(buyer)/buyer/orders/page.tsx:33-36, app/(buyer)/buyer/orders/[id]/page.tsx (/buyer/orders, /buyer/orders/[id])
- **Now:** "Pay now" appears only in the orders list, as a hardcoded `/pay/fake/${providerRef}`.
- **Problem:** A pending_payment order's detail page offers no way to pay. The hardcoded URL bypasses the payment adapter and will break when PayMongo replaces the fake gateway.
- **Fix:** In lib/data/orders.ts, build the pay URL server-side with `getPaymentProvider().resumeUrl(ref)`. Show it on both the list and the detail page.
- **Depends on:** none
- **Acceptance:** No `/pay/fake` string remains under app/(buyer). A pending order's detail page has a working Pay button.

### [x] B-7 · P2 · UI/UX · Order breakdown omits the courier fee
- **Platform:** Buyer
- **Where:** app/(buyer)/buyer/orders/[id]/page.tsx:180-184, 340-355 (/buyer/orders/[id])
- **Now:** The Items card shows the items subtotal, quoted fees and Total. The courier fee appears only in a separate Payment card.
- **Problem:** The rows do not add up to the Total. Example: ₱1,000 items + ₱120 courier shows Total ₱1,120 with no ₱120 row, which makes buyers doubt the charge.
- **Fix:** Add a "Courier fee" row to the Items breakdown when `shippingCentavos > 0`. Keep the Payment card for the COD paid/due split.
- **Depends on:** none
- **Acceptance:** On every order, subtotal + fees + courier fee equals the Total shown.

### [x] B-8 · P2 · UI/UX · Fake pay page lists full totals for COD downpayments
- **Platform:** Buyer
- **Where:** app/pay/fake/[ref]/page.tsx:44, 53-60 (/pay/fake/[ref])
- **Now:** "Covers" shows each order's `total_centavos`, while Amount is the downpayment.
- **Problem:** Amount ₱500 next to Covers ₱2,000 leaves the buyer unsure what they are paying for.
- **Fix:** Select `downpayment_centavos` and `payment_option`, and label COD lines "downpayment X of Y; rest due on delivery".
- **Depends on:** none
- **Acceptance:** For a COD custom order, the per-order lines add up to the Amount or are clearly labelled.

### [x] B-9 · P2 · bug · COD limit error shows raw centavos
- **Platform:** Buyer
- **Where:** supabase/migrations/20261112121106_delivery.sql:310 (check_cod), surfaced on /buyer/cart
- **Now:** Fixed by the master: `check_cod` now says "Orders above PHP x". Before the fix it read "Orders above 500000 centavos must be paid online".
- **Problem:** Buyers saw a raw centavo integer whenever the cap setting changed after the cart page loaded.
- **Fix:** Done: the message is formatted in pesos.
- **Depends on:** none
- **Acceptance:** The error text contains "PHP" or "₱" and no centavo integer.

### [x] B-10 · P2 · incomplete · COD checkout does not show what is due now
- **Platform:** Buyer
- **Where:** app/(buyer)/buyer/cart/cart-client.tsx:248-263, 295-302; lib/data/orders.ts:25; lib/actions/orders.ts:98 (/buyer/cart)
- **Now:** The downpayment note shows whether or not the cart has custom items. The payment-method radios are still required, the button says "Proceed to payment", and an all-COD order silently redirects to /buyer/orders.
- **Problem:** The buyer cannot see the amount due now, and the page suggests a payment step that may never happen.
- **Fix:** Add `return_class` to `getCart`. Show "Due now / on delivery" (display only), hide the method picker when nothing is due, relabel the button "Place COD order", and toast before redirecting.
- **Depends on:** none
- **Acceptance:** A COD cart of stock items only shows "Due now ₱0.00", no method picker, and a "Place order" button.

### [x] B-11 · P2 · bug · Buyer cannot confirm a pickup until the supplier marks it delivered
- **Platform:** Buyer
- **Where:** app/(buyer)/buyer/orders/[id]/page.tsx:378-388; supabase/migrations/20261112121106_delivery.sql:839-847 (/buyer/orders/[id])
- **Now:** ConfirmDelivery shows only after `mark_delivered` sets `deliveryClaimedAt`, although the SQL lets the buyer confirm any shipped non-courier order.
- **Problem:** If the supplier never presses "delivered", a buyer who has the goods cannot confirm. The order stays 'shipped', and neither the payout clock nor the claim windows start.
- **Fix:** Show ConfirmDelivery whenever `awaitingDelivery`. Keep the notice only when `deliveryClaimedAt` is set.
- **Depends on:** none
- **Acceptance:** A shipped buyer-pickup order without `delivery_claimed_at` shows a working "Confirm delivery".

### [x] B-29 · P3 · UI/UX · Order file links expire after 10 minutes
- **Platform:** Buyer
- **Where:** lib/data/orders.ts:140 (/buyer/orders/[id], /buyer/claims/[id])
- **Now:** Artwork, proof and evidence URLs are signed for 600 seconds when the page renders.
- **Problem:** A buyer who reviews a proof for more than 10 minutes and then clicks the file gets a storage error, right at the approval step.
- **Fix:** Increase the expiry (e.g. 3600 s), or sign on click through a small server route.
- **Depends on:** none
- **Acceptance:** The proof link still opens 15 minutes after page load.

**RFQs & deals**

### [x] B-3 · P1 · bug · Quote comparison uses a different quantity than the payment
- **Platform:** Buyer
- **Where:** components/quote-comparison.tsx:40,120; components/buyer-dashboard.tsx:49,126; components/rfq-detail.tsx:347; supabase/migrations/20261112105243_deals.sql:765-772 (/buyer/rfqs/[id], /buyer)
- **Now:** The comparison table and "Lowest estimated total" use `rfq.quantity`. The quote card and `select_supplier` (the amount charged) use `quote.quantity`.
- **Problem:** If the buyer asks for 5,000 and a supplier quotes 3,000, the table compares that supplier at 5,000 but charges for 3,000. "Lowest total" can point at the wrong supplier.
- **Fix:** Compare each quote at its own quoted quantity, and flag quotes whose quantity differs from the RFQ.
- **Depends on:** none
- **Acceptance:** The comparison total equals `selection.amount_centavos` after selecting, and a quantity mismatch is flagged.

### [x] B-18 · P2 · UI/UX · Selection dialog says no money moves, then asks for payment
- **Platform:** Buyer
- **Where:** components/rfq-detail-client.tsx:116-122, 144; components/rfq-detail.tsx:158 (/buyer/rfqs/[id])
- **Now:** The dialog says selecting "does not transfer funds or legally execute a purchase order". The next step asks the buyer to pay through TULAY. Only the base-quote total is shown, even when an accepted counteroffer is chosen.
- **Problem:** The copy contradicts the flow, and the buyer does not see the real amount before committing.
- **Fix:** Reword to "You will pay ₱X through TULAY next" and show the total for the chosen offer (display only).
- **Depends on:** B-3
- **Acceptance:** The dialog amount matches the following "Pay ₱X" step for both base-quote and counteroffer choices.

### [x] B-25 · P3 · UI/UX · RFQ stepper shows no state for draft, needs_information or cancelled
- **Platform:** Buyer
- **Where:** components/rfq-detail.tsx:22-28, 172-188 (/buyer/rfqs/[id])
- **Now:** Only under_review, matching, invited, quoting and supplier_selected are highlighted.
- **Problem:** Other statuses leave no step highlighted, so the progress bar looks broken.
- **Fix:** Map needs_information to "Submitted", and show an explicit Draft or Cancelled state instead of the stepper.
- **Depends on:** none
- **Acceptance:** A needs_information RFQ highlights a step or shows an explicit state.

### [x] B-26 · P3 · UI/UX · Conversation copy hedges about access
- **Platform:** Buyer
- **Where:** components/rfq-detail.tsx:241-243 (/buyer/rfqs/[id])
- **Now:** The panel says "Only the buyer and the supplier assigned to each thread should have access."
- **Problem:** The word "should" reads like an unresolved security doubt, although RLS already enforces this.
- **Fix:** Change to "Only you and this supplier can see this conversation."
- **Depends on:** none
- **Acceptance:** The copy is updated.

### [x] B-27 · P3 · missing functionality · Deal orders do not link back to their RFQ
- **Platform:** Buyer
- **Where:** app/(buyer)/buyer/orders/[id]/page.tsx; lib/data/orders.ts:96 (`selectionId` loaded but unused) (/buyer/orders/[id])
- **Now:** An order paid from an RFQ deal shows no RFQ, quote or negotiation reference.
- **Problem:** The buyer cannot check the agreed terms from the order.
- **Fix:** When `selectionId` is set, show "From RFQ <ref>" linking to /buyer/rfqs/<rfqId>.
- **Depends on:** none
- **Acceptance:** A deal order's page links to its RFQ.

**Claims & reviews**

### [x] B-16 · P2 · UI/UX · Claim types not filtered by item return class
- **Platform:** Buyer
- **Where:** app/(buyer)/buyer/orders/[id]/report-problem.tsx:32-36, 39, 80, 108-124; supabase/migrations/20261112123143_after_sales.sql:291-303 (/buyer/orders/[id])
- **Now:** Claim types are filtered only by days since delivery. Evidence uploads before `open_claim` runs.
- **Problem:** "Change of mind return" shows on custom-only orders and "Print defect" on stock orders. The server rejects the claim after up to 10 files of 50 MB have uploaded, leaving orphaned files. The file-type error also omits MP4/MOV.
- **Fix:** Pass each item's `returnClass` and offer only the types that apply. Fix the Zod message.
- **Depends on:** none
- **Acceptance:** An all-custom order shows no return option, and a stock-only order shows no defect option.

### [x] B-17 · P2 · missing functionality · Claim messages and review replies send no notification
- **Platform:** Buyer
- **Where:** supabase/migrations/20261112123143_after_sales.sql:443-460, 525-535 (/buyer/claims/[id])
- **Now:** Fixed by the master: `add_claim_message` and `reply_review` now notify the other party.
- **Problem:** A supplier could post the return address in a claim thread and the buyer was never told, which stalled returns.
- **Fix:** Done in SQL.
- **Depends on:** B-1 (buyers need a place to see notifications)
- **Acceptance:** A supplier claim message creates a buyer notification linking to /buyer/claims/<id>.

### [x] B-20 · P3 · incomplete · Message composer shows on closed claims
- **Platform:** Buyer
- **Where:** app/(buyer)/buyer/claims/[id]/page.tsx:209-214; components/claim-thread.tsx:417, 455 (/buyer/claims/[id])
- **Now:** SQL now rejects messages on closed claims; the UI composer still needs to be hidden. The `closed` prop is never passed.
- **Problem:** Buyers can type into resolved, declined or cancelled claims and only get an error after sending.
- **Fix:** Pass `closed={["resolved","declined","cancelled"].includes(claim.status)}` to ClaimThread.
- **Depends on:** none
- **Acceptance:** A resolved claim shows no message form.

### [x] B-21 · P3 · UI/UX · Claims do not link to their order
- **Platform:** Buyer
- **Where:** app/(buyer)/buyer/claims/page.tsx:48; app/(buyer)/buyer/claims/[id]/page.tsx:96 (/buyer/claims, /buyer/claims/[id])
- **Now:** The order ref is plain text in the list and in the header.
- **Problem:** There is no way to get from a claim back to its order.
- **Fix:** Link `orderRef` to `/buyer/orders/<orderId>`, adding `orderId` to Claim if it is missing.
- **Depends on:** none
- **Acceptance:** Clicking the order ref opens the order.

### [x] B-22 · P3 · UI/UX · "Paid back directly ₱0.00" row on online refunds
- **Platform:** Buyer
- **Where:** app/(buyer)/buyer/claims/[id]/page.tsx:169 (/buyer/claims/[id])
- **Now:** The direct-refund row always renders for refund claims.
- **Problem:** Online-paid orders show "₱0.00 paid back directly", which reads like an unpaid debt.
- **Fix:** Render the row only when `manualRefundCentavos > 0` or the status is `refund_pending`.
- **Depends on:** none
- **Acceptance:** A fully online refund shows no direct-refund row.

**Navigation, cart & saved**

### [x] B-13 · P2 · bug · Saved page copy is wrong and saved items can vanish
- **Platform:** Buyer
- **Where:** app/(buyer)/buyer/saved/saved-client.tsx:233; saved/page.tsx:207; lib/data/catalog.ts:110-119 (/buyer/saved)
- **Now:** The page says "Saved in this browser only" although saves are in `saved_items`. Items are found by filtering the newest 1,000 live listings.
- **Problem:** Saved products outside that set disappear silently, and the whole catalog loads just to show a few items.
- **Fix:** Change the copy to "Saved to your account". Load saved products by id, and mark missing ones "no longer available".
- **Depends on:** none
- **Acceptance:** A saved product outside the newest 1,000 still appears, and the copy no longer says "browser only".

### [x] B-14 · P2 · UI/UX · Add to cart replaces the quantity; visitors get no sign-in path
- **Platform:** Buyer
- **Where:** lib/actions/orders.ts:25-39; components/add-to-cart.tsx:41 (/products/[id])
- **Now:** An upsert replaces the quantity, and the toast says "Added to cart". Visitors only get the toast "Sign in to add items".
- **Problem:** Adding 100 when 200 are in the cart leaves 100. Visitors have no link to sign in and no way back to the product.
- **Fix:** Add the quantities server-side, or say "Cart quantity set to N". Send visitors to `/login?next=/products/<id>`.
- **Depends on:** none
- **Acceptance:** Two adds of 100 give 200, or the toast clearly says "set". A visitor lands on login and returns to the product.

### [x] B-15 · P2 · missing functionality · No cart link in the public header
- **Platform:** Buyer
- **Where:** components/site-header.tsx:31-36, 71-75 (all public pages)
- **Now:** Signed-in header links are Messages and Account only.
- **Problem:** After adding to cart, the only way to the cart is the "View cart" button on the product page or the buyer workspace.
- **Fix:** Add `/buyer/cart` with a line count to the signed-in header and the mobile bar.
- **Depends on:** none
- **Acceptance:** A Cart link shows on /marketplace for signed-in users on mobile and desktop.

### [x] B-19 · P2 · missing functionality · Buyer overview has no order to-dos
- **Platform:** Buyer
- **Where:** components/buyer-dashboard.tsx:38-43, 142-152 (/buyer)
- **Now:** The overview is RFQ-only, and all four tiles link to /buyer/rfqs.
- **Problem:** Payments awaiting, proofs to approve, deliveries to confirm and open claims are hidden, though they are the most common buyer tasks.
- **Fix:** Add an "Action needed" list from `listOrders("buyer")` and the buyer's open claims.
- **Depends on:** B-1, B-6
- **Acceptance:** With a 'sent' proof, /buyer lists "Approve proof for <ref>" linking to the order.

### [x] B-28 · P3 · UI/UX · Address delete has no confirmation; Edit off-screen on mobile
- **Platform:** Buyer
- **Where:** app/(buyer)/buyer/addresses/address-book.tsx:70-82 (/buyer/addresses)
- **Now:** Delete removes the address at once. Edit loads the form below the list without scrolling to it.
- **Problem:** An accidental tap loses the address, and on phones Edit appears to do nothing.
- **Fix:** Add a confirm dialog. On Edit, scroll the form into view and focus it.
- **Depends on:** none
- **Acceptance:** Delete asks for confirmation, and Edit on mobile brings the form into view.

### [x] B-30 · P3 · UI/UX · Disabled checkout button gives no reason
- **Platform:** Buyer
- **Where:** app/(buyer)/buyer/cart/cart-client.tsx:158, 302 (/buyer/cart)
- **Now:** "Proceed to payment" is disabled when a line is unavailable, priced on request, or under the MOQ.
- **Problem:** Nothing near the button says why, and on mobile the line hints can be far up the page.
- **Fix:** When the cart is blocked, show a Notice above the button.
- **Depends on:** none
- **Acceptance:** A cart with an under-MOQ line shows an explanation next to the disabled button.

**Notifications & messaging**

### [x] B-1 · P1 · missing functionality · Buyers never see their notifications
- **Platform:** Buyer
- **Where:** components/buyer-dashboard.tsx:20-156; lib/data/deals.ts:52; components/dashboard-overview.tsx:61 (admin only); lib/actions/deals.ts:212 (/buyer)
- **Now:** The database writes buyer notifications (proof ready, delivered, claim decided, refund sent), but no buyer screen shows them, and `markNotificationsRead` is unused.
- **Problem:** A buyer is never told a proof is waiting, so production stalls while the cancel window runs out.
- **Fix:** Add a "Recent updates" list to the buyer dashboard and an unread count in the workspace header. Mark notifications read when the list is viewed.
- **Depends on:** none
- **Acceptance:** After `send_proof`, /buyer shows "Proof ready" linking to the order, and the unread count clears after viewing.

### [?] B-5 · P2 · missing functionality · No messaging for catalog orders
- **Platform:** Buyer
- **Where:** components/inbox.tsx:63; lib/threads.ts:220-244; app/(buyer)/buyer/orders/[id]/page.tsx (/buyer/messages, /buyer/orders/[id])
- **Now:** Messages exist only for RFQ threads, and the order page does not even link to the supplier.
- **Problem:** Custom-print buyers cannot ask about artwork or delivery. Scope needs an owner decision (a new order_messages table with RLS).
- **Fix:** Now: link the supplier name to /suppliers/<id>. After the decision: per-order threads written by the master, shown on both order pages.
- **Depends on:** B-1; owner decision on scope
- **Acceptance:** From an order, the buyer can reach the supplier and send a message the supplier sees on /supplier/orders/<id>.

**Shared UI**

### [x] B-4 · P1 · UI/UX · Account page privacy statement is false
- **Platform:** Buyer
- **Where:** components/account-form.tsx:79; lib/data/orders.ts:186; supabase/migrations/20261112105243_deals.sql:780 (/buyer/account)
- **Now:** The page says the details "are not published to suppliers".
- **Problem:** Suppliers do get the buyer's name, business, email and phone, on orders and after selection. This is a misleading privacy claim under the Data Privacy Act.
- **Fix:** State which details are shared and when, and link to /privacy.
- **Depends on:** none
- **Acceptance:** The copy matches what `getOrder` and selection actually share.

### [x] B-12 · P2 · UI/UX · Out-of-date "sample data" banner on every workspace page
- **Platform:** Buyer
- **Where:** components/workspace-shell.tsx:82-84 (all /buyer pages)
- **Now:** The banner says "Other screens still show sample data."
- **Problem:** Cart, orders, claims and RFQs are live, and the banner makes buyers distrust real order data.
- **Fix:** Remove the banner, or limit it to the remaining demo screens.
- **Depends on:** none
- **Acceptance:** /buyer/orders shows no sample-data banner.

### [x] B-23 · P3 · UI/UX · Status pills grey for most order, refund and claim states
- **Platform:** Buyer
- **Where:** components/common.tsx:34-39 (all buyer lists and details)
- **Now:** `STATUS_TONE` has no entries for order, refund, claim or shipment statuses.
- **Problem:** A failed refund looks the same as a succeeded one, and returned or failed_attempt parcels are not highlighted.
- **Fix:** Add good, bad and warn tones for those statuses.
- **Depends on:** none
- **Acceptance:** A failed refund pill is red and a succeeded one is green.

### [x] B-24 · P3 · architecture · Admin settings hardcoded in copy
- **Platform:** Buyer
- **Where:** app/(buyer)/buyer/cart/cart-client.tsx:305; app/(buyer)/buyer/rfqs/new/rfq-form.tsx:476 (/buyer/cart, /buyer/rfqs/new)
- **Now:** The copy hardcodes "Stock is held for 15 minutes" and "Max 5 RFQs per day".
- **Problem:** Both are admin settings (`checkout_ttl_minutes`, `rfq_max_per_day`), so the text goes wrong when an admin changes them. This breaks the rule against hardcoded business values.
- **Fix:** Read them with `getNumberSettings` in the page server components and pass them down.
- **Depends on:** none
- **Acceptance:** Changing either setting changes the displayed text.

## Supplier and logistics platform

**Orders & fulfilment**

### [?] S-5 · P1 · bug · Suspended supplier's in-flight orders are frozen
- **Platform:** Supplier / Logistics
- **Where:** supabase/migrations/20261112121106_delivery.sql:660-673 (`private.my_order` needs verified); orders RLS money.sql:1033-1038; app/(supplier)/supplier/orders/[id]/fulfilment-actions.tsx (/supplier/orders/[id])
- **Now:** A suspended supplier still sees paid orders and fulfilment buttons, but every RPC fails with "Order not found". No admin cancel or reassign function exists.
- **Problem:** A suspension leaves paid orders stuck with no exit, and the buyer cannot cancel once production has started. The supplier sees a misleading error, and claims (`my_claim`) follow a different rule.
- **Fix:** Owner decides between "suspended suppliers can still fulfil existing orders" and "admin cancel and refund", then `my_order` and the UI follow that rule. Show a notice when the supplier is not verified.
- **Depends on:** none
- **Acceptance:** For a suspended supplier with an in-production order, either fulfilment works or a "contact support" notice shows, and support can cancel and refund the order.

### [?] S-16 · P2 · architecture · RFQ-deal orders are always custom
- **Platform:** Supplier
- **Where:** delivery.sql:477-481 (`start_selection_checkout` hardcodes `returnClass 'custom'`); fulfilment-actions.tsx:14-16
- **Now:** Every RFQ-deal order is treated as custom-made.
- **Problem:** A bulk RFQ for plain stock goods (e.g. 500 blank boxes) cannot ship until a proof is sent and approved, and the wrong claim types apply to it.
- **Fix:** Take the return class from the quote (the supplier picks it), or get an owner decision.
- **Depends on:** none
- **Acceptance:** A non-custom deal order offers the ship or hand-over step right after payment.

### [x] S-17 · P2 · bug · Proof can be sent before any artwork
- **Platform:** Supplier
- **Where:** delivery.sql:700-723 (`send_proof`); app/(supplier)/supplier/orders/[id]/page.tsx:22-23 (/supplier/orders/[id])
- **Now:** Fixed in SQL: `send_proof` now requires artwork. Still to do: the UI "Waiting for the buyer's artwork" state.
- **Problem:** The order page still offers the proof upload when there is no artwork, so the supplier only gets a database error.
- **Fix:** Hide ProofUpload and show "Waiting for the buyer's artwork" while `order.artwork` is empty.
- **Depends on:** none
- **Acceptance:** A custom order with no artwork shows the waiting state and no proof form.

### [x] S-18 · P2 · bug · Orphan proof files on a rejected send
- **Platform:** Supplier
- **Where:** app/(supplier)/supplier/orders/[id]/proof-upload.tsx:43-55; delivery.sql:925-930
- **Now:** Fixed: the storage policy no longer lets suspended suppliers upload proofs. Still to do: remove the uploaded file when `send_proof` rejects.
- **Problem:** When `sendProof` fails (e.g. a proof is still awaiting an answer), the uploaded file stays in `order-files` with no row pointing to it.
- **Fix:** On `!res.ok`, call `storage.from("order-files").remove([storagePath])`.
- **Depends on:** none
- **Acceptance:** A rejected `sendProof` leaves no object under `<order>/proofs/`.

### [?] S-22 · P2 · missing functionality · No buyer–supplier messaging on orders
- **Platform:** Supplier
- **Where:** app/(supplier)/supplier/messages/page.tsx; lib/threads.ts:20-56 (/supplier/messages)
- **Now:** The inbox holds RFQ threads only.
- **Problem:** Catalog orders (e.g. custom shirts from the cart) have no channel for artwork questions, so the conversation moves outside TULAY.
- **Fix:** Agree the scope, then add order-scoped messages (table, RLS, RPC with notify) on both order pages.
- **Depends on:** S-1
- **Acceptance:** The supplier can message the buyer from /supplier/orders/[id], and the buyer is notified.

### [x] S-25 · P3 · UI/UX · Orders list has no filters or next step
- **Platform:** Supplier
- **Where:** app/(supplier)/supplier/orders/page.tsx:27-58; lib/data/orders.ts:172 (/supplier/orders)
- **Now:** One flat table, newest first, with no paging.
- **Problem:** With many orders the supplier cannot find what needs action, and there is no COD marker.
- **Fix:** Add status tabs and a "Next step" column (send proof, start production, book courier).
- **Depends on:** none
- **Acceptance:** A "Needs action" filter shows only orders waiting on the supplier.

### [x] S-26 · P3 · UI/UX · Supplier order and claim pages show the user's own purchases
- **Platform:** Supplier
- **Where:** app/(supplier)/supplier/orders/[id]/page.tsx:13-14; claims/[id]/page.tsx:17-18
- **Now:** `getOrder` and `getClaim` return any row that RLS allows.
- **Problem:** One account buys and sells, so its own purchase opens in the supplier view with fulfilment buttons that fail.
- **Fix:** Call `notFound()` unless `order.supplierId` is the viewer's supplier id (same check for claims).
- **Depends on:** none
- **Acceptance:** Opening one's own purchase under /supplier returns 404.

### [x] S-30 · P3 · UI/UX · COD orders are labelled "Paid"
- **Platform:** Supplier
- **Where:** orders/[id]/page.tsx:35; orders/page.tsx:24, 37, 54
- **Now:** The header reads "Paid <date>", and the list says "Paid orders".
- **Problem:** A full-COD order with nothing paid online still reads "Paid".
- **Fix:** Show "Confirmed (COD) <date>" when `paymentOption === 'cod'`.
- **Depends on:** none
- **Acceptance:** A COD order with no downpayment never shows "Paid".

**Shipping & logistics**

### [x] S-3 · P1 · bug · Courier booked before validation, without idempotency
- **Platform:** Supplier / Logistics
- **Where:** lib/actions/delivery.ts:106-123 (/supplier/orders/[id], "Book courier pickup")
- **Now:** Fixed: `check_can_book_shipment` runs before `courier.book`, and booking errors are caught.
- **Problem:** Before the fix, double clicks or orders not ready to ship produced orphan courier bookings, and adapter exceptions crashed the action.
- **Fix:** Done. Pass the order id as the courier idempotency key once Ninja Van is wired.
- **Depends on:** none
- **Acceptance:** A non-ready order makes no `book()` call, and a throwing courier returns `{ok:false}`.

### [x] S-7 · P2 · security · Buyer could drive the fake courier page
- **Platform:** Supplier / Logistics
- **Where:** lib/actions/delivery.ts:127-137; app/ship/fake/[ref]/page.tsx:24-29
- **Now:** Fixed: the page and `simulateTracking` are limited to the shipping supplier or support.
- **Problem:** Before the fix, a buyer could mark their own parcel delivered or returned in non-production deployments.
- **Fix:** Done.
- **Depends on:** none
- **Acceptance:** A buyer session gets 404 on /ship/fake/<ref>.

### [!] S-19 · P2 · missing functionality · No cancel or rebook of a shipment, and nothing to do after a failed attempt
- **Platform:** Supplier / Logistics
- **Where:** fulfilment-actions.tsx:20-27; delivery.sql:107-117 (`shipments.order_id` unique)
- **Now:** Once a shipment exists, the UI shows only a link to the fake courier page, or nothing for a real carrier.
- **Problem:** A wrong booking or a missed pickup cannot be cancelled or rebooked, and a `failed_attempt` gives the supplier no prompt.
- **Fix:** Add `cancel_shipment` while the status is 'booked' (through the adapter), and a failed-attempt notice with the buyer's contact.
- **Depends on:** S-3
- **Acceptance:** A booked shipment that has not been picked up can be cancelled and booked again.

**Products & inventory**

### [x] S-4 · P1 · bug · Stock save overwrote concurrent reservations
- **Platform:** Supplier
- **Where:** money.sql:926-954 (`set_stock`); products/product-options.tsx:302-325; lib/actions/orders.ts:243 (/supplier/products)
- **Now:** Fixed: `set_stock` takes the expected value and refuses stale saves.
- **Problem:** Before the fix, a save made from a stale page wiped reservations and caused overselling.
- **Fix:** Done. Consider renaming the field label "Units on hand" to "Available".
- **Depends on:** none
- **Acceptance:** A save made with an outdated expected value is refused with "stock changed, reload".

### [x] S-23 · P3 · UI/UX · Unverified suppliers see controls that fail
- **Platform:** Supplier
- **Where:** products/product-form.tsx:132-133; product-images.tsx:93-111; product-options.tsx:249-264, 339; invites/invite-actions.tsx:18-33
- **Now:** Only Edit and Submit are disabled when the supplier cannot list.
- **Problem:** Suspended or unverified suppliers can still click image upload, Save options, Save stock and Accept/Decline, and each returns a database error.
- **Fix:** Pass `canList` down and disable or hide those controls, with a notice.
- **Depends on:** S-5
- **Acceptance:** For a suspended supplier every listing and invite control is disabled.

### [ ] S-24 · P3 · feature opportunity · No pause or unlist for approved listings
- **Platform:** Supplier
- **Where:** product-form.tsx:126-131; supplier-dashboard.tsx:20-24
- **Now:** Taking a listing offline means editing it (which sends it back to review) or setting stock to 0, and dashboard counts leave out drafts.
- **Problem:** A discontinued item cannot simply be hidden, and drafts are invisible on the dashboard.
- **Fix:** Add a `pause_product` RPC using the existing 'paused' status, and a Drafts tile on the dashboard.
- **Depends on:** none
- **Acceptance:** An approved listing can be paused and resumed without review.

**Claims & after-sales**

### [x] S-6 · P1 · bug · Claim resolved although the online refund failed
- **Platform:** Supplier
- **Where:** after_sales.sql:184-203 (`settle_claim`); lib/actions/claims.ts:132-133, 140-141; lib/refunds.ts:30-32 (/supplier/claims/[id])
- **Now:** Backend fixed: a claim stays refund_pending until the gateway refund succeeds, and finance can re-issue failed refunds. UI copy for the supplier still to do.
- **Problem:** The supplier still gets a failure toast for an accept that actually succeeded, with the refund only delayed.
- **Fix:** Return `{ok:true}` with a warning and show "Claim accepted; refund being processed".
- **Depends on:** none
- **Acceptance:** A forced gateway failure shows the supplier an accepted-with-pending-refund message, not an error.

### [x] S-14 · P2 · UI/UX · Refund cap not shown in the claim form
- **Platform:** Supplier
- **Where:** app/(supplier)/supplier/claims/[id]/supplier-claim-actions.tsx:105-109; after_sales.sql:222-223
- **Now:** SQL errors are now in pesos. Still to do: the cap hint in the form.
- **Problem:** The hint says "Up to what is still refundable" without a number, so the supplier has to guess.
- **Fix:** Pass `claimable_left` to the page and show "Up to ₱X" in the hint.
- **Depends on:** none
- **Acceptance:** The refund field shows the peso maximum.

### [x] S-15 · P2 · missing functionality · Returns did not restock
- **Platform:** Supplier
- **Where:** after_sales.sql:402-411 (`confirm_return_received`), 430-439 (`mark_replacement_sent`)
- **Now:** Fixed: change-of-mind returns restock on "item received".
- **Problem:** Before the fix, returned standard items never went back into stock. Replacements still neither decrement stock nor carry a tracking reference.
- **Fix:** Done for returns. Consider a stock decrement and a tracking ref for replacements.
- **Depends on:** none
- **Acceptance:** "Item received" on a return claim increases the stock of tracked items.

### [x] S-27 · P3 · UI/UX · Claim composer shown on closed claims, with wrong placeholder
- **Platform:** Supplier
- **Where:** app/(supplier)/supplier/claims/[id]/page.tsx:133-138; components/claim-thread.tsx:67-70
- **Now:** SQL now rejects messages on closed claims. UI composer still to hide.
- **Problem:** Resolved claims still show a composer that will fail, and the supplier's placeholder says "Write to the supplier".
- **Fix:** Pass `closed` for terminal statuses and use a role-specific placeholder.
- **Depends on:** none
- **Acceptance:** A resolved claim shows no composer, and the supplier's placeholder mentions the buyer.

### [x] S-28 · P3 · bug · Restocking fee cap not enforced on the server
- **Platform:** Supplier
- **Where:** lib/actions/claims.ts:160-169; after_sales.sql:25-27, 226-228 (/supplier/claims)
- **Now:** Only the client checks the cap, and `accept_claim` silently applies `least()`.
- **Problem:** A direct call can store 20% while the cap is 0, so the page shows a fee that is never charged.
- **Fix:** Check against `restocking_fee_max_bps` in the action or with a DB trigger.
- **Depends on:** none
- **Acceptance:** `setRestockingFee("20")` with cap 0 returns an error.

### [x] S-33 · P3 · UI/UX · Validation errors only in toasts
- **Platform:** Supplier
- **Where:** supplier-claim-actions.tsx:46-50; claims/restocking-fee.tsx:39-43; proof-upload.tsx:36-38
- **Now:** Zod errors are shown only as toasts.
- **Problem:** There is no inline error or `aria-invalid`, so screen-reader users lose the context once the toast disappears.
- **Fix:** Pass the errors to `Field`, as `useServerForm` does.
- **Depends on:** none
- **Acceptance:** An invalid refund amount shows an inline error and `aria-invalid` on the input.

**Payouts & money**

### [x] S-12 · P2 · missing functionality · Payout status not visible per order
- **Platform:** Supplier
- **Where:** app/(supplier)/supplier/payouts/page.tsx:9-29; app/(supplier)/supplier/orders/[id]/page.tsx (/supplier/payouts, /supplier/orders/[id])
- **Now:** "Currently owed" is the whole `supplier_payable` balance, and the order page shows no delivery or payout information.
- **Problem:** Undelivered and on-hold orders count as owed, and the supplier cannot see when, or in which payout, an order is paid.
- **Fix:** Split the balance into on hold, scheduled and released. Show the delivered date, eligible date and PO ref on the order.
- **Depends on:** none
- **Acceptance:** A delivered order shows its payout-eligible date, and the payouts page shows the on-hold amount separately.

### [x] S-13 · P2 · bug · "You receive" wrong for COD refunds and cancellations
- **Platform:** Supplier
- **Where:** app/(supplier)/supplier/orders/page.tsx:11-14; orders/[id]/page.tsx:18-19, 57-65
- **Now:** "You receive" = total − commission − gateway fee − succeeded online refunds.
- **Problem:** COD cash the supplier paid back on a claim is ignored, and a cancelled or returned COD order shows the full total as received.
- **Fix:** Subtract the manual refunds of resolved claims, and show the kept online amount or "—" for cancelled orders.
- **Depends on:** none
- **Acceptance:** A ₱500 manual refund reduces "You receive" by ₱500, and a cancelled COD order does not show its full total.

**RFQs & quotes**

### [x] S-20 · P2 · UI/UX · Quote submit button has no pending state
- **Platform:** Supplier
- **Where:** app/(supplier)/supplier/rfqs/[id]/quote/quote-form.tsx:46-51, 224 (/supplier/rfqs/[id]/quote)
- **Now:** `pending` from `useServerForm` is never used.
- **Problem:** There is no feedback during submission, so suppliers click again.
- **Fix:** Destructure `pending` and set `disabled={pending}` on the button.
- **Depends on:** none
- **Acceptance:** The button is disabled while the action runs.

### [?] S-21 · P2 · UI/UX · Quote payment terms vs full online payment
- **Platform:** Supplier
- **Where:** quote-form.tsx:116-124; delivery.sql:422-488 (deal checkout)
- **Now:** Payment terms are free text with the placeholder "50% downpayment, balance before shipment".
- **Problem:** Buyers always pay 100% online at checkout, so the terms a supplier promises are never applied.
- **Fix:** Owner decision: change the copy to "Paid in full online through TULAY" or remove the field.
- **Depends on:** none
- **Acceptance:** The quote copy matches how deal checkout actually works.

### [x] S-31 · P3 · bug · Expired quotes listed as awaiting buyers
- **Platform:** Supplier
- **Where:** components/supplier-dashboard.tsx:46-50, 158-170 (/supplier)
- **Now:** The card lists the latest quote of any RFQ that is still quoting.
- **Problem:** Quotes past `validUntil` appear as awaiting, although the buyer can no longer select them.
- **Fix:** Filter to `validUntil >= today`, or show an "Expired, revise" state.
- **Depends on:** none
- **Acceptance:** An expired quote shows as expired, not awaiting.

### [x] S-32 · P3 · missing functionality · Selected supplier has no link to the order
- **Platform:** Supplier
- **Where:** components/rfq-detail.tsx:131-145 (/supplier/rfqs/[id])
- **Now:** The selected supplier sees "The buyer selected your quotation" and the buyer's contact.
- **Problem:** Once the buyer pays there is no link to the resulting order.
- **Fix:** Look up the order by selection for the supplier role and link to /supplier/orders/[id].
- **Depends on:** none
- **Acceptance:** After deal payment, the supplier's RFQ page links to the order.

**Dashboard, notifications & shared UI**

### [x] S-1 · P1 · missing functionality · Suppliers never see notifications
- **Platform:** Supplier
- **Where:** components/supplier-dashboard.tsx:26-226; lib/data/deals.ts:52; lib/actions/deals.ts:212; components/nav.ts:21-35 (/supplier)
- **Now:** The database writes supplier notifications, but no supplier page renders them and `markNotificationsRead` is never called.
- **Problem:** New orders, claims with a 3-day answer window and payouts arrive unseen, so the supplier misses deadlines.
- **Fix:** Render the notifications on the dashboard, add a header bell with an unread count, and mark them read.
- **Depends on:** none
- **Acceptance:** After a paid checkout, the supplier sees "New order ORD-…" with a link, and the unread count clears after viewing.

### [x] S-2 · P1 · missing functionality · Missing supplier notifications for fulfilment events
- **Platform:** Supplier / Logistics
- **Where:** delivery.sql:839-910; money.sql:820-856; after_sales.sql:331-341, 354-371, 443-459
- **Now:** Fixed: suppliers are notified for delivery, payout, claim, return and failed-attempt events.
- **Problem:** Before the fix, suppliers were not told when the payout clock started or when deliveries and returns changed.
- **Fix:** Done. The notifications only become visible once S-1 is done.
- **Depends on:** S-1
- **Acceptance:** DB tests show one notification for the supplier owner per event.

### [x] S-8 · P2 · missing functionality · Dashboard has no fulfilment work queue
- **Platform:** Supplier / Logistics
- **Where:** components/supplier-dashboard.tsx:29-221 (/supplier)
- **Now:** The dashboard shows the application, invites, quotes, listing counts and profile completeness only.
- **Problem:** Nothing shows orders to act on, open claims, low stock or scheduled payouts.
- **Fix:** Add count cards with links, built from `listOrders`, `listClaims` and `listPayouts`.
- **Depends on:** S-1
- **Acceptance:** A seeded supplier sees counts for paid orders, proofs to resend and open claims on /supplier.

### [?] S-9 · P2 · bug · Invite waiting time and hardcoded 24-hour rule
- **Platform:** Supplier
- **Where:** components/supplier-dashboard.tsx:38-43, 135-143; lib/data/deals.ts:49 (/supplier)
- **Now:** The waiting time counts from the RFQ's draft date, and the "Reply within 24 business hours" warning is hardcoded.
- **Problem:** An invite sent today can already show 3 days waiting plus the warning. No code enforces the rule, and business values must be admin settings (CLAUDE.md rule 7).
- **Fix:** Load `rfq_invites.created_at` and count from it, and move the window to `platform_settings`.
- **Depends on:** none
- **Acceptance:** An invite created today shows 0 business days waiting.

### [x] S-10 · P2 · UI/UX · "Sample data" banner is false
- **Platform:** Supplier
- **Where:** components/workspace-shell.tsx:82-84 (every workspace page)
- **Now:** A banner says other screens still show sample data.
- **Problem:** Orders, claims and payouts are live, so suppliers may ignore real orders.
- **Fix:** Remove the banner, or show it only on screens that use `useDemoForm`.
- **Depends on:** none
- **Acceptance:** The banner does not render on /supplier/orders.

### [x] S-11 · P2 · UI/UX · Status colours miss order, shipment, claim and payout statuses
- **Platform:** Supplier / Logistics
- **Where:** components/common.tsx:34-39 (`STATUS_TONE`)
- **Now:** Only application and RFQ statuses have colours.
- **Problem:** failed_attempt, returned, refund_pending and completed all look the same grey, and "confirmed" gives no hint that it means COD.
- **Fix:** Map every DB status to a tone and add label overrides such as "Confirmed (COD)".
- **Depends on:** none
- **Acceptance:** failed_attempt renders red, and a test covers every enum value.

### [x] S-29 · P3 · UI/UX · Documents not viewable; stale approval hint
- **Platform:** Supplier
- **Where:** app/(supplier)/supplier/profile/page.tsx:79-87; components/supplier-dashboard.tsx:110
- **Now:** Uploaded documents are listed by name only, and "You can quote only after approval" shows even to verified suppliers.
- **Problem:** The supplier cannot check which file was uploaded and sees a wrong warning.
- **Fix:** Link each document through a signed URL, and show the hint only when the supplier is not verified.
- **Depends on:** none
- **Acceptance:** Document names open the file, and verified suppliers do not see the hint.

## Administrator platform

**Roles, users & security**

### [x] A-3 · P1 · security / UI/UX · Admin UI ignores sub-roles (SQL done, UI still to do)
- **Platform:** Admin
- **Where:** lib/auth.ts:43-51, components/nav.ts:36-55, components/workspace-shell.tsx, all /admin/** action components
- **Now:** Every admin sees every nav item and action button; only the database enforces sub-roles. SessionUser now has subRoles and a canAdmin() helper in lib/auth.ts.
- **Problem:** A support admin sees Refund buttons that fail (finance only), a finance admin sees "Decide this claim" (support only), and a verifier sees false "No orders yet" empty states because RLS hides the rows. Admins learn what they may do only by hitting error toasts.
- **Fix:** Filter ROLE_NAV.admin and pass a `can` flag into refund-form, unmatched-refund, release-payout, decide-claim, supplier-review-buttons, review-buttons, rfq-queue-actions and settings-client. Show "Needs the X role" empty states and list the sub-roles held on /admin/account.
- **Depends on:** none
- **Acceptance:** A verifier-only admin sees no finance nav or buttons, a support admin sees no Refund buttons, and /admin/account lists the sub-roles held.

### [x] A-4 · P1 · missing functionality · No user lookup, account suspension or role management UI
- **Platform:** Admin
- **Where:** supabase/migrations/20261109141047_foundation.sql:393, :426, :446 (admin_set_account_status, admin_grant_role, admin_revoke_role); no /admin/users route
- **Now:** The DB functions exist, are granted and audit-logged, but nothing in the app calls them.
- **Problem:** Admins cannot find a user, suspend a buyer or seller account, or grant or revoke sub-roles without raw SQL. Suspending a supplier business leaves its owner free to keep buying.
- **Fix:** Add /admin/users with search by email, name or business, suspend/reactivate with a reason (support), and grant/revoke sub-roles (super admin) through new actions in lib/actions/admin.ts.
- **Depends on:** A-3
- **Acceptance:** A support admin finds a user by email and suspends them, after which their next request redirects to /login?suspended=1. A super admin's grant of "finance" appears in the audit log.

### [ ] A-20 · P2 · missing functionality · No MFA recovery or factor management
- **Platform:** Admin
- **Where:** app/(auth)/mfa/page.tsx, app/(auth)/mfa/mfa-client.tsx, app/(admin)/admin/account/page.tsx
- **Now:** TOTP is required for admins, with no recovery path and no factor management.
- **Problem:** An admin who loses their phone is locked out for good, and a super admin can reset their factor only with service-role SQL.
- **Fix:** Add a super-admin "Reset MFA" action behind a server-only adapter using the service-role admin API (master-owned). Show the enrolled factor on the admin account page.
- **Depends on:** A-4
- **Acceptance:** A super admin resets admin B's factor, and B is asked to enrol again at next sign-in.

### [x] A-21 · P2 · bug · Revoking the last sub-role strands the account
- **Platform:** Admin
- **Where:** supabase/migrations/20261109141047_foundation.sql:446-457 admin_revoke_role
- **Now:** Fixed in SQL: revoking the last sub-role sets the role back to buyer.
- **Problem:** Before the fix the account kept role = admin with no sub-roles, so it was sent to an empty /admin and could not use the buyer or supplier workspace.
- **Fix:** Done (role reset when no sub-roles remain).
- **Depends on:** none
- **Acceptance:** After its only sub-role is revoked, the user signs in and lands on /buyer.

**Orders, payments, refunds & payouts**

### [x] A-1 · P1 · bug · Refund form offers more than was paid online (SQL done, UI still to do)
- **Platform:** Admin
- **Where:** app/(admin)/admin/orders/page.tsx:40-56, app/(admin)/admin/orders/refund-form.tsx:125-130, /admin/orders
- **Now:** The UI computes refundable as total minus refunds, but the DB caps refunds at paid_online_centavos. The refund error is now in pesos.
- **Problem:** On a ₱10,000 COD order with a ₱5,000 downpayment, the form pre-fills ₱10,000 and fails. A pure-COD order shows a Refund button that always fails.
- **Fix:** Use `o.paidOnlineCentavos - refunded` in orders/page.tsx and hide the button when that is 0 or less.
- **Depends on:** none
- **Acceptance:** A COD order with a ₱5,000 downpayment shows "Up to ₱5,000.00" and refunds it, and a pure-COD order shows no Refund button.

### [x] A-6 · P1 · missing functionality · No admin order detail page
- **Platform:** Admin
- **Where:** app/(admin)/admin/orders/page.tsx (no row links), no app/(admin)/admin/orders/[id]; app/(admin)/admin/shipments/page.tsx:106 links to plain /admin/orders
- **Now:** Admins get a flat order table; items, address, proofs, history and shipment events are visible only through a claim page.
- **Problem:** Support cannot answer "where is my order?" or check a proof dispute, and the Shipments link drops the admin on an unfiltered list.
- **Fix:** Add app/(admin)/admin/orders/[id]/page.tsx using the existing getOrder() and signedOrderFileUrls(), and link it from the orders, shipments, payments, payouts and claims tables.
- **Depends on:** none
- **Acceptance:** Clicking an order ref on /admin/shipments opens that order's detail with its timeline, proofs and buyer contact.

### [x] A-9 · P2 · bug · Refunded unmatched payments stay flagged
- **Platform:** Admin
- **Where:** app/(admin)/admin/payments/page.tsx:11,21-27,49,64, app/(admin)/admin/payments/unmatched-refund.tsx:117-128, supabase/migrations/20261112113125_money.sql:791-815
- **Now:** admin_refund_unmatched leaves the payment in needs_review, and the page counts and offers "Refund in full" for every such payment.
- **Problem:** After a refund and a reload, the warning and the button come back, and clicking errors "already has a refund". Finance cannot tell open items from finished ones.
- **Fix:** Treat a payment as resolved when a non-failed unmatched refund exists for it (join refunds in listPayments), or move it to a terminal status in SQL.
- **Depends on:** none
- **Acceptance:** After refunding an unmatched payment and reloading, the warning count drops and the row shows the refund status instead of a button.

### [x] A-10 · P2 · missing functionality · No search, filters or paging on finance lists
- **Platform:** Admin
- **Where:** lib/data/orders.ts:161-177 (no limit), lib/data/orders.ts:218-251 (limit 200), lib/data/claims.ts:47-61, supabase/config.toml:19 max_rows = 1000
- **Now:** Orders, payments, payouts, refunds and claims have no search, filter or paging.
- **Problem:** Above 1,000 orders the admin list is silently truncated, and older payments beyond the 200 newest cannot be found. Nobody can look up an order by ref, buyer email or provider ref.
- **Fix:** Add `?q=&status=&page=` with .range() and an exact count in the data loaders, plus a shared pager component.
- **Depends on:** none
- **Acceptance:** /admin/orders?q=<ref> finds the order, page 2 shows the next rows, and the total count is shown.

### [x] A-18 · P2 · missing functionality · Payout release has no context or hold
- **Platform:** Admin
- **Where:** supabase/migrations/20261112113125_money.sql:858-890 admin_release_payout, app/(admin)/admin/payouts/release-payout.tsx:220-243
- **Now:** Any scheduled payout can be released from a dialog that shows no supplier or amount.
- **Problem:** Finance can pay a supplier suspended for fraud, or one with an escalated claim on an included order, with no warning. It is easy to confirm the wrong row.
- **Fix:** Show the supplier, amount and order refs in the dialog, with a warning when the supplier is not verified or an included order has an open claim. Optionally block in SQL unless overridden with a reason.
- **Depends on:** none
- **Acceptance:** Releasing a payout for a suspended supplier shows a warning that names the supplier and amount.

### [x] A-22 · P2 · UI/UX · Shipment problems drop off and the attention count never clears
- **Platform:** Admin
- **Where:** app/(admin)/admin/shipments/page.tsx:70-84, lib/data/orders.ts:145-157, /admin/shipments
- **Now:** Problem shipments sort first only within the 200 most recently updated, and the warning counts every returned or failed shipment ever.
- **Problem:** An older failed attempt disappears from the list, and the warning count only grows, so admins learn to ignore it.
- **Fix:** Query open problem shipments separately, add a status filter, and link each row to the order detail.
- **Depends on:** A-6
- **Acceptance:** A failed attempt from 3 months ago appears under the problem filter, and the count shows open problems only.

### [x] A-26 · P3 · UI/UX · Transactions page has stale copy and is a dead end
- **Platform:** Admin
- **Where:** app/(admin)/admin/transactions/page.tsx:17, components/dashboard-overview.tsx:30
- **Now:** The page says "payments arrive in Stage 4" and lists selections only, with no order or payment status.
- **Problem:** The copy is wrong now that Stage 4 is built, and an admin cannot trace a deal through to payment.
- **Fix:** Update the copy and add an order/payment status column linked to the order detail.
- **Depends on:** A-6
- **Acceptance:** Each selection row shows its order ref and status, or "Not paid".

**Catalog & supplier review**

### [x] A-5 · P1 · missing functionality · Supplier and product decisions are not notified
- **Platform:** Admin
- **Where:** supabase/migrations/20261109141047_foundation.sql:353-391 admin_set_supplier_status, supabase/migrations/20261111134936_catalog.sql:371-405 admin_review_product
- **Now:** Fixed in SQL: triggers on the status-history tables notify the supplier of each decision.
- **Problem:** Before the fix, suppliers got no notice of verification, rejection, suspension or product approval and rejection.
- **Fix:** Done (notification triggers on supplier_status_history and product_status_history).
- **Depends on:** none
- **Acceptance:** After Verify or Reject on /admin/suppliers or /admin/products, the supplier's "Recent updates" shows the decision and the reason.

### [x] A-8 · P1 · missing functionality · Live listings cannot be taken down; review view is shallow
- **Platform:** Admin
- **Where:** app/(admin)/admin/products/page.tsx, lib/data/catalog.ts:229-240, app/(admin)/admin/products/review-buttons.tsx, /admin/products
- **Now:** Only pending listings are shown, although the DB allows approved to rejected (catalog.sql:388). The view shows one image, 110 characters of text and a tier count.
- **Problem:** An admin cannot take down a counterfeit or prohibited live listing after a report, and reviewers approve without seeing all images, variants or the full text.
- **Fix:** Add a status filter and search, a "Take down" button with a reason, and a full preview of images, description, tiers and variants.
- **Depends on:** none
- **Acceptance:** An approved product can be found and taken down from /admin/products, and it disappears from /marketplace.

### [x] A-17 · P2 · incomplete · Supplier review list has no filters and signs every document
- **Platform:** Admin
- **Where:** lib/data/admin.ts:30-69, app/(admin)/admin/suppliers/page.tsx, /admin/suppliers
- **Now:** Every supplier loads with all documents, and every document gets a signed URL on each load. There is no filter, paging or status history.
- **Problem:** At hundreds of suppliers each page load signs thousands of URLs, verified suppliers crowd the queue, and resubmissions show no earlier rejection reason.
- **Fix:** Add status tabs (default pending/under_review) and search, sign URLs only for the shown page, and show supplier_status_history reasons.
- **Depends on:** none
- **Acceptance:** /admin/suppliers?status=pending shows only the queue, and a resubmitted application shows the earlier rejection reason.

### [x] A-28 · P3 · UI/UX · Review moderation shows no supplier, order or buyer
- **Platform:** Admin
- **Where:** app/(admin)/admin/reviews/page.tsx, lib/data/claims.ts:140-153 listReviews (select "*"), /admin/reviews
- **Now:** Each review card shows only the stars, text, date and supplier reply.
- **Problem:** An admin deciding whether to hide a review cannot see whose storefront it is on, which order it came from, or who wrote it, so moderation is blind.
- **Fix:** Join suppliers(business_name), orders(ref) and the buyer's name in listReviews and show them on the card, linking the order.
- **Depends on:** A-6
- **Acceptance:** Each review on /admin/reviews shows the supplier name, order ref and buyer name.

**RFQs, claims & messages**

### [x] A-14 · P2 · bug · Declined invites count toward the RFQ invite cap
- **Platform:** Admin
- **Where:** supabase/migrations/20261112105243_deals.sql:516-521 admin_invite_suppliers
- **Now:** Fixed in SQL: declined invites no longer count toward rfq_max_invites.
- **Problem:** Before the fix, an RFQ with 10 invites and 8 declines could not get any new suppliers invited.
- **Fix:** Done.
- **Depends on:** none
- **Acceptance:** With 10 invites and 8 declined, inviting 3 new suppliers succeeds.

### [x] A-15 · P2 · UI/UX · RFQ queue buries pending reviews; match dialog is hard to use
- **Platform:** Admin
- **Where:** app/(admin)/admin/rfqs/page.tsx:13, app/(admin)/admin/rfqs/rfq-queue-actions.tsx:209-232, app/(admin)/admin/rfqs/[id]/page.tsx:279-297
- **Now:** All non-draft RFQs are listed newest first. Manual match is an unsearchable checkbox list, and suggested suppliers are plain text.
- **Problem:** Items waiting for review get lost among closed RFQs, and with hundreds of suppliers an admin scrolls to find one already shown as a suggestion.
- **Fix:** Sort under_review first and add status tabs, add a filter to the match dialog, and add one-click invite on each suggestion.
- **Depends on:** none
- **Acceptance:** under_review RFQs are listed first, and a suggested supplier can be invited in one click.

### [x] A-16 · P2 · UI/UX · Claim refund hint shows the wrong cap and has no confirm step (SQL done, UI still to do)
- **Platform:** Admin
- **Where:** app/(admin)/admin/claims/[id]/page.tsx:123, app/(admin)/admin/claims/[id]/decide-claim.tsx:310, supabase/migrations/20261112123143_after_sales.sql:222-223
- **Now:** The hint shows the order total, while the DB caps at claimable_left. The error is now in pesos.
- **Problem:** On COD or partly refunded orders, admins enter an amount the DB rejects, and an irreversible refund or decline goes out in one click.
- **Fix:** Show the claimable amount (paid online minus non-failed refunds) as the hint, and add a confirm dialog showing the outcome and amount.
- **Depends on:** none
- **Acceptance:** The hint matches what the DB accepts, and a confirm dialog appears before submit.

### [?] A-23 · P3 · missing functionality · No support inbox; admin messages are read-only RFQ threads
- **Platform:** Admin
- **Where:** components/rfq-detail.tsx:96 (composer "none" for admin), app/(admin)/admin/messages/page.tsx, components/messages-list.tsx
- **Now:** Admin Messages lists RFQ threads read-only, with buyer copy ("Your sourcing messages", "Explore marketplace") and no claim threads.
- **Problem:** Support cannot contact a buyer or supplier outside an escalated claim and has no single place to follow claim threads. The owner still has to decide whether support may post in RFQ threads.
- **Fix:** List claim threads sorted by last message, change the copy for admins, and enable RFQ posting only if the owner approves.
- **Depends on:** none
- **Acceptance:** /admin/messages lists claim threads, newest first, each linking to /admin/claims/[id].

**Settings, audit & ledger**

### [x] A-2 · P1 · bug · Settings accept out-of-range values (SQL done, UI still to do)
- **Platform:** Admin
- **Where:** lib/actions/admin.ts:31, supabase/migrations/20261112105243_deals.sql:20-23, supabase/migrations/20261109141047_foundation.sql:459 admin_update_setting, /admin/settings
- **Now:** admin_update_setting now range-checks bps, days, centavos and email. The action still accepts any 12-digit whole number before calling it.
- **Problem:** Before the fix, a value above int4 (e.g. ₱50M COD cap) broke every checkout, and bps above 10000 made the downpayment larger than the order. The UI should show these limits as field errors, not generic toasts.
- **Fix:** Mirror the per-key ranges in updateSetting so they come back as field errors.
- **Depends on:** none
- **Acceptance:** Saving cod_downpayment_bps=15000, cod_max_order_centavos=5000000000 or support_email=abc shows a field error, and the value does not change.

### [x] A-7 · P1 · bug · Parent-category commission steps skip subcategories
- **Platform:** Admin
- **Where:** app/(admin)/admin/settings/settings-client.tsx:129, supabase/migrations/20261109141047_foundation.sql:259-267 commission_rate_bps
- **Now:** Fixed in SQL: a step on a parent category applies to its subcategories.
- **Problem:** Before the fix, a step on "Packaging & printing" never reached DTF prints or mug products, so orders froze the wrong rate.
- **Fix:** Done.
- **Depends on:** none
- **Acceptance:** A future 2% step on packaging returns 200 from commission_rate_bps(<dtf-prints id>, <after start>).

### [x] A-11 · P2 · incomplete · Audit log is the last 100 rows with unreadable actors
- **Platform:** Admin
- **Where:** lib/data/admin.ts:110-125, app/(admin)/admin/audit/page.tsx:15,39-40, /admin/audit
- **Now:** The page shows the latest 100 entries, with actor and target as 8-character UUID fragments and no filters.
- **Problem:** Nobody can answer "who refunded order X" or "what did admin Y do last week", and older entries are unreachable.
- **Fix:** Add filters (action, target, actor, date) and paging, resolve actor names, and link targets to their admin pages.
- **Depends on:** none
- **Acceptance:** Filtering by an order's target_id lists every action on it with actor names, and page 2 works.

### [x] A-19 · P2 · UI/UX · Ledger shows gateway clearing as negative; no filters
- **Platform:** Admin
- **Where:** app/(admin)/admin/ledger/page.tsx:78,94, lib/data/orders.ts:253-268, /admin/ledger
- **Now:** Every balance is shown as credit minus debit, over the latest 500 entries with no filters.
- **Problem:** Money actually held at the gateway shows as e.g. "-₱9,700.00", which misleads anyone reconciling with PayMongo, and older entries cannot be reached.
- **Fix:** Flip the sign for debit-normal accounts on display, and add supplier and order filters with paging.
- **Depends on:** none
- **Acceptance:** After one paid order, Gateway clearing shows a positive amount equal to the net received.

### [x] A-24 · P3 · incomplete · Open items and units are not clear in settings
- **Platform:** Admin
- **Where:** app/(admin)/admin/settings/settings-client.tsx:46-110
- **Now:** "OPEN ITEM:" appears only inside the description hint, and values are shown in raw centavos or bps.
- **Problem:** "5000" bps and "0" centavos are easy to misread (e.g. typing 50 for 50%), and open items do not stand out for owner review.
- **Fix:** Add an "Open item" badge, a unit suffix with the converted value, and the last-updated time.
- **Depends on:** A-2
- **Acceptance:** Each open-item setting shows a badge, and bps/centavos settings show the converted value next to the input.

### [x] A-25 · P3 · missing functionality · No UI for search synonyms
- **Platform:** Admin
- **Where:** supabase/migrations/20261111134941_search.sql:31,44 (admin_add_search_synonym / admin_remove_search_synonym)
- **Now:** The DB functions exist, and nothing calls them.
- **Problem:** Admins cannot add synonyms such as "tarp → tarpaulin" without SQL, so buyer searches miss listings.
- **Fix:** Add a synonyms card on /admin/settings, with new actions in lib/actions/admin.ts.
- **Depends on:** none
- **Acceptance:** A synonym added from the UI changes /marketplace search results.

**Dashboard & shared UI**

### [x] A-12 · P2 · incomplete · Admin overview has no work queue and loads every deal
- **Platform:** Admin
- **Where:** components/dashboard-overview.tsx:27-58, lib/data/deals.ts:38-62, /admin
- **Now:** The overview shows platform-wide RFQ, quote and selection counts, built by loading every deal row without a limit.
- **Problem:** Admins see nothing about pending suppliers, products, escalated claims, payments or payouts. The load grows with the platform, and the counts go wrong past 1,000 rows.
- **Fix:** Add adminWorkQueue() using head/count queries filtered by sub-role, and render it instead of calling loadDeals for admins.
- **Depends on:** A-3
- **Acceptance:** The overview shows counts such as "3 suppliers to review · 2 escalated claims", each linking to its page, with no loadDeals call for admins.

### [x] A-13 · P2 · missing functionality · Admin alerts reach the wrong role; no notifications page (SQL done, UI still to do)
- **Platform:** Admin
- **Where:** supabase/migrations/20261112105243_deals.sql:215-221 notify_support, components/dashboard-overview.tsx:68 (only the latest 5 shown)
- **Now:** private.notify_admins was added: finance now hears about payments needing review, and verifiers about new applications and listings. Admins still see only 5 notifications on the dashboard.
- **Problem:** Anything older than the latest 5 is invisible, and nothing can be marked read, so admins miss work items.
- **Fix:** Add a /admin/notifications list (reusable for buyer and supplier) with read state.
- **Depends on:** none
- **Acceptance:** Notifications older than the latest 5 can be reached from /admin/notifications.

### [x] A-27 · P3 · UI/UX · Thrown action errors replace the page
- **Platform:** Admin
- **Where:** components/form.tsx:60-77 useServerAction; no app/(admin)/admin/error.tsx
- **Now:** The awaited action has no try/catch.
- **Problem:** A network failure or a thrown server error escapes the transition and shows the root error page instead of a toast, so the admin loses their place.
- **Fix:** Wrap the call in try/catch and show a toast, and add app/(admin)/admin/error.tsx.
- **Depends on:** none
- **Acceptance:** With the network offline, clicking Approve shows an error toast and the page stays in place.

## Public site, authentication and shared infrastructure

**Security**

### [x] P-1 · P1 · security · Security headers missing
- **Platform:** Shared
- **Where:** next.config.ts:1-17 (all routes)
- **Now:** Fixed by the master: security headers are set in next.config.ts and X-Powered-By is off (verified with curl). Before: no `headers()` config, and `X-Powered-By: Next.js` was sent.
- **Problem:** Without X-Frame-Options/CSP frame-ancestors, HSTS, nosniff or Referrer-Policy, /login, /mfa and /admin/* could be framed by any site (clickjacking).
- **Fix:** `poweredByHeader: false` plus `headers()` for `/:path*`: X-Frame-Options DENY, nosniff, Referrer-Policy, HSTS and Permissions-Policy.
- **Depends on:** none
- **Acceptance:** `curl -sI /login` shows the headers and no X-Powered-By.

### [x] P-8 · P2 · security · Password change without re-auth
- **Platform:** Auth
- **Where:** app/(auth)/login/actions.ts:167-178, app/(auth)/reset-password/page.tsx:20-23 (/reset-password)
- **Now:** Fixed by the master: /reset-password and updatePassword now require a fresh reset-link cookie set by /auth/confirm (verified). Before: any signed-in session could open /reset-password.
- **Problem:** Anyone holding a stolen or shared session could set a new password without the old one and lock out the owner, admins included.
- **Fix:** Allow a password change only within a fresh recovery window.
- **Depends on:** P-9
- **Acceptance:** A normal session visiting /reset-password is turned away, and a reset-link session can set a password.

**Authentication & accounts**

### [x] P-9 · P2 · bug · Email links consumed by link scanners
- **Platform:** Auth
- **Where:** app/auth/confirm/route.ts:9-23, supabase/templates/* (/auth/confirm)
- **Now:** Fixed by the master: email links now open /auth/continue, and verification runs only on POST (verified that a GET does not use up the token). Before: a GET called verifyOtp immediately.
- **Problem:** Corporate mail scanners (Safe Links and similar) fetched the link first and used up the token, so the user's click showed "expired".
- **Fix:** Interstitial page with a button that POSTs the verification.
- **Depends on:** none
- **Acceptance:** A GET leaves the token valid, and the click-through signs the user in.

### [x] P-10 · P2 · missing functionality · No resend confirmation email
- **Platform:** Auth
- **Where:** app/(auth)/login/login-client.tsx:129-137, actions.ts:129-131 (/login)
- **Now:** Fixed by the master: a resend-confirmation button appears after an unconfirmed sign-in.
- **Problem:** Before the fix, a user with a lost or expired confirmation mail was stuck, and signing up again was silently ignored.
- **Fix:** `supabase.auth.resend({type:"signup"})` behind an always-OK action.
- **Depends on:** none
- **Acceptance:** After an `email_not_confirmed` error, Resend delivers a new mail to Mailpit.

### [x] P-11 · P2 · UI/UX · `next` lost through sign-up
- **Platform:** Auth
- **Where:** login-client.tsx:135, register/page.tsx:234,253, actions.ts:147
- **Now:** Fixed by the master: `next` is carried through /register and sign-up and stored in user metadata, so after confirming the email the user lands on it (verified).
- **Problem:** Before the fix, visitors bounced from Request a quote or Add to cart lost their place after sign-up and landed on /buyer.
- **Fix:** Carry `next` through the links and the email confirmation.
- **Depends on:** none
- **Acceptance:** Signed out on /buyer/rfqs/new, sign up, confirm, and you land on /buyer/rfqs/new.

### [x] P-12 · P2 · missing functionality · No Terms/Privacy consent at sign-up
- **Platform:** Auth
- **Where:** login-client.tsx:106-121, lib/validation/forms.ts:48-50 (/login?new=1)
- **Now:** Fixed by the master: a required Terms/Privacy checkbox, with accepted_terms_at stored in metadata.
- **Problem:** Before the fix, the Terms claimed agreement on account creation, but consent was never shown or recorded (Data Privacy Act exposure).
- **Fix:** A required checkbox in signUpSchema with links to /terms and /privacy.
- **Depends on:** none
- **Acceptance:** Sign-up fails until the box is ticked, and accepted_terms_at is in the user metadata.

### [x] P-6 · P1 · bug · Visitor saves invisible and lost at sign-in
- **Platform:** Shared
- **Where:** components/saved-items-provider.tsx:84-91, lib/saved.ts:149-150 (all public cards)
- **Now:** Signed-out hearts save to localStorage. Signed-in saves come from `saved_items`.
- **Problem:** No page shows visitor saves (/saved is 404), and sign-in never merges them. Example: save 5 products, sign up, and /buyer/saved shows 0.
- **Fix:** On sign-in, call `setSaved` for each local id and then clear localStorage, or send visitors to /login?next= when they press the heart.
- **Depends on:** none
- **Acceptance:** Save 2 items signed out, sign in, and /buyer/saved lists both.

### [x] P-13 · P2 · UI/UX · Add to cart while signed out only shows a toast
- **Platform:** Public site
- **Where:** components/add-to-cart.tsx:41, lib/actions/orders.ts:31-32 (/products/[id])
- **Now:** Signed out, the action returns "Sign in to add items to your cart." as a toast.
- **Problem:** There is no route to sign in and come back, so the visitor must find Sign in and then go back to the product themselves.
- **Fix:** Return an `unauthenticated` flag and `router.push('/login?next=' + pathname)`.
- **Depends on:** none
- **Acceptance:** Signed out, Add to cart goes to /login?next=/products/<id>, and signing in returns to the product.

### [x] P-30 · P3 · UI/UX · Inconsistent auth wording; /login open when signed in
- **Platform:** Auth
- **Where:** app/(auth)/login/page.tsx:4, components/site-header.tsx:14 and :185 (/login, header, footer)
- **Now:** The title says "Log in" but the UI says "Sign in". "Help center" goes to /contact. "Supplier sign in" goes to the same form. Signed-in users still see the sign-in form.
- **Problem:** The wording is confusing, the supplier link undercuts the one-account rule, and a signed-in user can start a second session.
- **Fix:** Rename the title and links. Redirect signed-in users from /login to `homeFor(role)`.
- **Depends on:** none
- **Acceptance:** The copy is consistent, and a signed-in user opening /login lands on their hub.

**Legal & copy**

### [x] P-2 · P1 · incomplete · Placeholder business details shown on every page
- **Platform:** Shared
- **Where:** components/site-header.tsx:232-235, lib/site.ts:2-12, privacy/page.tsx:21,28, terms/page.tsx:12,117,123
- **Now:** The footer prints `[Registered business name]` and `[DPO email]` on every page, and privacy and terms print all SITE placeholders.
- **Problem:** Every visitor sees bracketed template text (4 occurrences each in the HTML of `/`), which looks unfinished and makes the legal notice incomplete.
- **Fix:** Move the contact page's `isSet` check into lib/site.ts and use it to hide unset values in the footer and legal pages.
- **Depends on:** [?] Owner must supply the registered business name, registration number, address, DPO name and email, and support email.
- **Acceptance:** `curl -s /` contains no `[...]` placeholders.

### [x] P-3 · P1 · bug · Privacy/terms copy outdated (one-time codes, print-only scope)
- **Platform:** Public site
- **Where:** app/(public)/privacy/page.tsx:22,35-36, terms/page.tsx:19-20 (/privacy, /terms)
- **Now:** Privacy cites "one-time codes or Google sign-in". Privacy and terms describe a custom print and packaging marketplace.
- **Problem:** Sign-in is email and password, Google sign-in is deferred, and scope is general B2B (owner decision 2026-11-11), so the RA 10173 notice misstates the facts.
- **Fix:** Reword sign-in records and the scope sentence to match CLAUDE.md.
- **Depends on:** none
- **Acceptance:** grep finds no "one-time codes", "Google sign-in" or "custom print and" in privacy or terms.

### [x] P-4 · P1 · bug · Register notice contradicts one-account rule
- **Platform:** Auth
- **Where:** app/(auth)/register/page.tsx:274 (/register)
- **Now:** Fixed by the master: the notice now says one account can buy and sell.
- **Problem:** Before the fix, it told users to create a separate email for each role, contrary to the owner decision.
- **Fix:** Replace the notice text.
- **Depends on:** none
- **Acceptance:** /register no longer mentions a separate email.

### [x] P-5 · P1 · bug · Home carousel shows demo promotions
- **Platform:** Public site
- **Where:** app/(public)/home-carousel.tsx:7-12, lib/demo/data.ts:359-363 (/)
- **Now:** The carousel renders the hardcoded `PROMOTIONS` demo array.
- **Problem:** Real visitors see invented claims ("from 24 pieces", "from verified suppliers") that are tied to no real supplier.
- **Fix:** Render nothing in production until a promotions table exists.
- **Depends on:** none
- **Acceptance:** The production `/` HTML does not contain "Custom shirts for your team".

### [x] P-14 · P2 · bug · Copy says no checkout; payments wording wrong
- **Platform:** Public site
- **Where:** marketplace-client.tsx:737, how-it-works/page.tsx:12,108-109, page.tsx:152
- **Now:** Quick view says "not an instant checkout yet". How-it-works says payments go "through PayMongo and Ninja Van" and are "handled separately".
- **Problem:** Cart and checkout exist, and Ninja Van is the courier (COD only), so visitors get the wrong picture of how buying works.
- **Fix:** Update the Quick view notice. Rewrite how-it-works steps 5-6 and the notice to cover buy or quote, PayMongo or COD, and returns.
- **Depends on:** none
- **Acceptance:** No public page says checkout is unavailable, and the payments copy matches CLAUDE.md.

### [x] P-15 · P2 · bug · Workspace banner says screens show sample data
- **Platform:** Shared
- **Where:** components/workspace-shell.tsx:82-84 (all /buyer, /supplier, /admin)
- **Now:** Every workspace page shows "Other screens still show sample data."
- **Problem:** Only admin promotions are still demo, so the banner tells users their real orders and RFQs are fake.
- **Fix:** Remove the banner, or show it only on /admin/promotions.
- **Depends on:** none
- **Acceptance:** /buyer shows no "sample data" banner.

**Discovery: home, marketplace, search, suppliers**

### [x] P-7 · P1 · UI/UX · AI Mode composer covered by bottom nav / compare tray
- **Platform:** Public site
- **Where:** search/search-client.tsx:168, site-header.tsx:163, compare-tray.tsx:13 (/search)
- **Now:** The composer is `sticky bottom-4 z-20`. The mobile nav is `fixed bottom-0 h-16 z-40`, and the compare tray is `md:bottom-4 z-40`.
- **Problem:** On phones the Send button sits under the nav. On desktop the compare tray covers the composer whenever items are in compare.
- **Fix:** Use `bottom-20 md:bottom-4`, and hide or offset the compare tray on /search.
- **Depends on:** none
- **Acceptance:** At 375px the Send button is fully visible, and with items in compare the desktop composer is not covered.

### [x] P-16 · P2 · bug · Supplier tab ignores smart search
- **Platform:** Public site
- **Where:** app/(public)/marketplace/marketplace-client.tsx:281, 129-137 (/marketplace?q=)
- **Now:** Products come from `search_catalog`. Suppliers are filtered by a literal substring of the whole query.
- **Problem:** For "custom shirts" the Suppliers tab shows 0 even when that supplier's products match, so the two tabs contradict each other.
- **Fix:** When `q` is set, include the suppliers of the product hits.
- **Depends on:** none
- **Acceptance:** /marketplace?q=custom%20shirts&tab=suppliers lists every supplier with a product in the Products tab.

### [x] P-17 · P2 · UI/UX · Marketplace filters, sort and page not in URL
- **Platform:** Public site
- **Where:** marketplace-client.tsx:243-256 (/marketplace)
- **Now:** All filter, sort, page and view state lives in useState (flagged as a shortcut).
- **Problem:** Back from a product resets to page 1 with no filters, and filtered results cannot be shared or bookmarked.
- **Fix:** Mirror the state into search params with `router.replace`.
- **Depends on:** none
- **Acceptance:** Filter, go to page 2, open a product, press Back, and the same filters and page show.

### [x] P-18 · P2 · missing functionality · Supplier directory search is narrow and unpaginated
- **Platform:** Public site
- **Where:** suppliers/suppliers-client.tsx:36-43, 112-121 (/suppliers)
- **Now:** Search matches name, category, city, province and description only, and all suppliers render on one page.
- **Problem:** "mugs" misses a supplier with a mugs keyword or mug products, and hundreds of cards render at once.
- **Fix:** Also match `keywords` and product titles, and paginate 12 per page with the marketplace's Pagination.
- **Depends on:** none
- **Acceptance:** A supplier with keyword "mugs" appears, and more than 12 results show page controls.

### [?] P-19 · P2 · missing functionality · No directed RFQ or contact from a storefront
- **Platform:** Public site
- **Where:** suppliers/[id]/page.tsx:67-71, buyer/rfqs/new/page.tsx:10, supplier-card.tsx:84
- **Now:** "Request a quote" opens a generic RFQ form. The storefront has no Save button and no way to contact the supplier.
- **Problem:** A buyer who picked a supplier cannot send the RFQ to them, though B2B visitors expect "Contact supplier".
- **Fix:** Pass `?supplier=<id>` as a preferred invitee and add a supplier SaveButton. The invite-logic change needs an owner decision.
- **Depends on:** Owner decision on directed RFQs
- **Acceptance:** From a storefront, the RFQ form shows "Sending to <supplier>" and the RFQ invites that supplier.

### [x] P-20 · P2 · bug · Home "Business services" unbounded
- **Platform:** Public site
- **Where:** app/(public)/page.tsx:60, 127-131 (/)
- **Now:** Every live service listing renders on the home page.
- **Problem:** With 200 services the home page shows 200 cards, and the page is already 378 KB.
- **Fix:** `.slice(0, 10)`; "View all" already links to ?type=service.
- **Depends on:** none
- **Acceptance:** At most 10 service cards show on /.

### [x] P-28 · P3 · bug · Stale compare ids block the tray
- **Platform:** Public site
- **Where:** compare-tray.tsx:7-16, compare/compare-client.tsx:43-47
- **Now:** Compare ids stored in localStorage are never pruned.
- **Problem:** A delisted product still counts toward 4 of 4, so adding is blocked while /compare shows only 3.
- **Fix:** On /compare, remove stored ids that are missing from the catalog.
- **Depends on:** none
- **Acceptance:** A delisted id leaves the tray after visiting /compare.

### [x] P-31 · P3 · UI/UX · Empty home sections render
- **Platform:** Public site
- **Where:** app/(public)/page.tsx:108-125, 180-183 (/)
- **Now:** "Featured suppliers" and "Recommended" render their headings even with no data.
- **Problem:** A low-inventory launch shows headings over blank space with no prompt to post a request.
- **Fix:** Render these sections only when they have items, and show the RFQ call to action when the catalog is empty.
- **Depends on:** none
- **Acceptance:** With 0 listings, / has no empty headed sections.

### [x] P-32 · P3 · feature opportunity · Product page lacks save, compare and a useful report link
- **Platform:** Public site
- **Where:** app/(public)/products/[id]/page.tsx:143-198
- **Now:** The sidebar has cart, RFQ and supplier facts. "Report this listing" goes to a plain /contact.
- **Problem:** Save and compare exist only on cards, and reports arrive with no product reference.
- **Fix:** Add a SaveButton and a compare toggle. Link the report to `/contact?reference=<id>` and pre-fill it.
- **Depends on:** none
- **Acceptance:** A product can be saved or compared from its own page, and the report form has the reference pre-filled.

**SEO & performance**

### [x] P-21 · P2 · performance · Product images unoptimized
- **Platform:** Shared
- **Where:** next.config.ts (no remotePatterns), product-card.tsx:50, products/[id]/page.tsx:107,116
- **Now:** Storage images are served `unoptimized` at full resolution.
- **Problem:** Grids download multi-MB phone photos on mobile data, with no resizing and no WebP/AVIF.
- **Fix:** Add `images.remotePatterns` for the Supabase host and drop `unoptimized` (keep it for the MFA QR).
- **Depends on:** none
- **Acceptance:** Card images load via `/_next/image?...&w=`.

### [ ] P-22 · P2 · performance · Public catalog not cached
- **Platform:** Shared
- **Where:** lib/data/catalog.ts:110-124 (/, /suppliers, /compare, /search)
- **Now:** A cookie-bound per-request query, with `Cache-Control: no-store`.
- **Problem:** Each anonymous view runs a 1,000-row join, building 378 KB for / and 202 KB for /suppliers, though the data is identical for every visitor.
- **Fix:** Use a cookie-less anon read in `"use cache"` with cacheLife and `revalidateTag("catalog")` on approvals.
- **Depends on:** none
- **Acceptance:** Two anonymous / loads trigger one catalog query.

### [x] P-23 · P2 · missing functionality · No sitemap, robots, Open Graph or descriptions
- **Platform:** Shared
- **Where:** app/layout.tsx:11-14, products/[id]/page.tsx:37-40, suppliers/[id]/page.tsx:35-38
- **Now:** A title template and one description only. /robots.txt and /sitemap.xml return 404.
- **Problem:** Shared links show no preview on Messenger, Viber or LinkedIn, and private routes are not excluded from indexing.
- **Fix:** Add metadataBase and openGraph, per-page descriptions and images, app/robots.ts, app/sitemap.ts, and noindex on auth and workspace pages.
- **Depends on:** none
- **Acceptance:** robots.txt and sitemap.xml return 200, and a product page has og:title, og:description and og:image.

### [x] P-25 · P3 · bug · Soft 404 with wrong title
- **Platform:** Public site
- **Where:** products/[id]/page.tsx:37-40,59; suppliers/[id]/page.tsx (/products/abc)
- **Now:** An unknown id returns HTTP 200 with the title "Listing · TULAY" and the 404 body.
- **Problem:** Crawlers and monitors see a 200 status and a misleading title.
- **Fix:** Call `notFound()` inside generateMetadata when the lookup is null.
- **Depends on:** none
- **Acceptance:** `curl -w '%{http_code}' /products/abc` prints 404.

**Accessibility & shared UI**

### [x] P-24 · P2 · UI/UX · Skip link broken on public pages
- **Platform:** Shared
- **Where:** app/layout.tsx:22-27, app/(public)/layout.tsx:9
- **Now:** The skip link targets `#main`, but no public page has that id.
- **Problem:** Keyboard users must tab through the whole header on every public page.
- **Fix:** Add `id="main" tabIndex={-1}` to the public layout wrapper.
- **Depends on:** none
- **Acceptance:** On /marketplace, the skip link moves focus past the header.

### [x] P-26 · P3 · incomplete · Only a root error boundary, no logging
- **Platform:** Shared
- **Where:** app/error.tsx:1-28
- **Now:** A single root boundary with no reporting and no support link.
- **Problem:** A public-page error drops the header and bottom nav, stranding mobile users, and errors go unrecorded.
- **Fix:** Add app/(public)/error.tsx with `console.error` (Sentry later), and link support to /contact.
- **Depends on:** none
- **Acceptance:** A thrown error on a public page still shows the site header.

### [x] P-27 · P3 · UI/UX · Active nav item not visible
- **Platform:** Shared
- **Where:** components/mobile-menu.tsx:466-480, 496-515
- **Now:** `aria-current="page"` is set, but the styling never changes.
- **Problem:** Sighted users cannot tell which tab or section is active.
- **Fix:** Add `aria-[current=page]:text-primary font-semibold` classes.
- **Depends on:** none
- **Acceptance:** On /categories, the Categories tab is visibly highlighted.

### [x] P-29 · P3 · UI/UX · Inbox shows date only, no unread or refresh
- **Platform:** Shared
- **Where:** components/inbox.tsx:110, 164-168 (/buyer/messages, /supplier/messages)
- **Now:** Messages show YYYY-MM-DD only and refresh only after the viewer sends.
- **Problem:** Same-day messages are indistinguishable by time, and nothing signals a reply.
- **Fix:** Use `dateTime()` now. Add polling or Realtime and an unread badge later.
- **Depends on:** none
- **Acceptance:** Bubbles show HH:mm.

## Second pass (after implementation)

Found while reviewing the workers' changes and re-running the checks.

### [x] R-1 · P1 · Bug · Supplier never saw the order behind a paid RFQ deal
- **Platform:** Supplier
- **Where:** lib/data/orders.ts `orderForSelection`; RLS on `checkouts`
- **Now:** Uses the new `order_for_selection` RPC, which returns only order id and status, to the buyer or the selected supplier.
- **Problem:** Before the fix, the loader joined `checkouts`, which suppliers cannot read (a cart checkout can span several suppliers), so S-32's link always said "not paid yet".
- **Fix:** Security-definer RPC (migration 20261115121011).
- **Depends on:** S-32
- **Acceptance:** A supplier with a paid deal order gets its id. Typecheck and the DB suite pass.

### [x] R-2 · P2 · Bug · Refused proof uploads could not be removed
- **Platform:** Supplier
- **Where:** storage policies on `order-files`
- **Now:** A supplier may delete a proof file of their own order only while no `proofs` row uses it. Sent and approved proofs stay as evidence.
- **Problem:** Before the fix, S-18's cleanup called storage delete, but no delete policy existed, so orphans stayed.
- **Fix:** New storage delete policy.
- **Depends on:** S-18
- **Acceptance:** A refused send leaves no object. A proof that has a row cannot be deleted.

### [x] R-3 · P2 · Bug · Cart link shown only to buyer-role accounts
- **Platform:** Public, Buyer
- **Where:** components/site-header.tsx
- **Now:** Shown for every non-admin account, because one account buys and sells.
- **Problem:** Supplier-role accounts, who can also buy, had no cart link.
- **Fix:** `user.role !== "admin"`.
- **Depends on:** B-15
- **Acceptance:** A supplier account sees Cart in the header.

### [ ] R-4 · P3 · Performance · Admin RFQ queue filters in memory
- **Platform:** Admin
- **Where:** app/(admin)/admin/rfqs/page.tsx (marked `shortcut`)
- **Now:** Loads all deals, then filters and sorts in memory.
- **Problem:** It gets slow and truncates past about 1,000 RFQs.
- **Fix:** A database query with `.range()`, like the other admin lists.
- **Depends on:** none
- **Acceptance:** Page 2 of the RFQ queue loads from the database.

### [ ] R-5 · P3 · UI/UX · Admin messages no longer lists RFQ threads
- **Platform:** Admin
- **Where:** app/(admin)/admin/messages/page.tsx
- **Now:** Shows contact messages and claim threads, and links to the RFQ queue for RFQ threads.
- **Problem:** Support has to open each RFQ to read its threads.
- **Fix:** Add an admin variant of components/messages-list.tsx.
- **Depends on:** A-23
- **Acceptance:** /admin/messages lists RFQ threads with admin wording.

### [x] R-6 · P3 · UI/UX · Admin claims empty state names the wrong role
- **Platform:** Admin
- **Where:** app/(admin)/admin/claims/page.tsx
- **Now:** Says "Needs the support role" although finance can also read claims.
- **Problem:** The guidance is slightly misleading.
- **Fix:** Say "Needs the support or finance role".
- **Depends on:** none
- **Acceptance:** The copy matches the gate.

### Remaining status notes
- **D-8 [!]:** Playwright needs the package and a browser download, and CLAUDE.md requires your approval to add a dependency or download anything.
- **S-19 [!]:** Cancelling or rebooking a courier booking needs the Ninja Van API, which waits for the business permit.
- **S-9 [?]:** The invite-age display is fixed. The "reply within N hours" rule needs a business decision and an admin setting (`invite_reply_hours`), so the warning stays hidden until then.
- **Still open, no external blocker:**
  - A-20: MFA reset. It needs the service-role admin API, which is security-sensitive, so the master will do it.
  - S-24: pause a listing. It needs a new product status.
  - P-22: catalog caching. The shared catalog query is not cached yet.
