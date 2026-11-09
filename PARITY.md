# Legacy parity checklist

Tracks every Apps Script behavior in `legacy/apps-script/` against its new home. Updated at the end of each stage.
`legacy/apps-script/`, `.clasp.json` and `appsscript.json` are deleted only when every row is **ported** or **dropped** (with owner approval).

Status: **ported**, **in progress**, **dropped**, **not started**. Last updated: Stage 0 (2026-11-09).

| Legacy | Functions | New home | Stage | Status |
| --- | --- | --- | --- | --- |
| Auth.js | apiRequestCode, apiVerifyCode, apiLogout | Supabase Auth (email/SMS OTP, Google). Limits: 60s cooldown, 4/h and 12/day per email, 60/h and 200/day global, 5 attempts per code, 12/h and 30/day failed verifies per email, 10-min code, 12h session | 1 | in progress: cooldown, 10-min expiry, 12h session and 60/h global email cap set in `supabase/config.toml`; the rest is app-level |
| Auth.js, Security.js | OTP hashing, pepper, digest_, session_ | Replaced by Supabase Auth | 0 | dropped (by brief) |
| Database.js | Sheets helpers, LockService | Replaced by Postgres | 0 | dropped (by brief) |
| Code.js | doGet, include_, diagnose* | Apps Script entry points | 0 | dropped (by brief) |
| Account.js | apiGetMyProfile, apiSaveMyProfile | profiles, buyer_businesses, addresses | 1 | not started |
| Supplier.js | apiSaveSupplier, apiRespondInvite, apiSubmitQuote | Supplier application; RFQ invites; append-only quotes with revisions and idempotent request IDs | 1, 3 | not started |
| Buyer.js | apiSaveRfq, apiSelectSupplier | RFQs (draft and submit, max 5 per buyer per day); supplier selection (becomes an order in Stage 4) | 3 | not started |
| Catalog.js | apiMarketplacePublic, apiMarketplaceWorkspace, apiSupplierSaveProduct, apiAdminReviewProduct, apiAdminSavePromotion, apiAdminTogglePromotion | Products with admin review, homepage promotions, public catalog | 1, 2 | not started |
| Discovery.js | apiSmartSearch, apiSupplierDiscoveryProfile, apiSupplierSaveDiscovery, apiPreviewSupplierMatches, apiAdminRetryAutoMatch, autoMatchSubmittedRfq_ | Postgres full-text + trigram search, search_synonyms, delivery areas and keywords, auto-invite up to 5 per RFQ, matching_runs, max 24 results, up to 10 manual invitees | 2, 3 | not started |
| Negotiation.js | apiCounterOffer, apiRespondOffer, apiSendMessage | Append-only offers and messages with rate limits; Tawad on listed products | 3 | not started |
| Admin.js | apiAdminReviewSupplier, apiAdminReviewRfq, apiAdminMatch, apiAdminSetAccountStatus, apiAdminAuditLog | Verification queue, RFQ moderation, manual matching, suspension, read-only audit log | 1, 3 | not started |
| Code.js | apiPublic, apiBootstrap | Server-rendered public pages and per-role dashboards | 1, 2 | not started |
| Config.js | T.CATS, T.RFQ, BUYSON_POLICY | seed.sql and admin settings. RFQ states DRAFT, UNDER_REVIEW, NEEDS_INFORMATION, MATCHING, INVITED, QUOTING, SUPPLIER_SELECTED, CANCELLED; max quantity 10,000,000; old categories become Packaging subcategories; old and new synonyms | 1, 2 | not started |
| Index.html, Client.html, Styles.html | All screens | Next.js + Tailwind, mobile-first, red theme | 1–3 | in progress: red theme tokens and placeholder home page |
