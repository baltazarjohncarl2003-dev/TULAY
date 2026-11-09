# TULAY: Orchestration and Project Rules

TULAY is a Philippine B2B marketplace for custom print and packaging (custom shirts, DTF, sublimation, packaging, customized mugs, customized IDs). Suppliers manufacture, TULAY connects them to buyers, Ninja Van delivers, PayMongo processes payments. **TULAY never holds buyer money.**

## 1. Roles

| Role | Model | Effort | Responsibility |
| --- | --- | --- | --- |
| **Master** (this session) | Claude Opus 5.5 | high | Plans, decomposes, writes the critical code, reviews everything, owns stage gates |
| **Worker** (`tulay-coder` subagent) | Claude Haiku 5.5 | high | Implements one small, fully specified task and reports back |

The master is the only agent that talks to the human, decides architecture, merges work and declares a stage done. Workers never decide; they implement.

When spawning a worker, always use `subagent_type: "tulay-coder"` and set effort to `high`.

## 2. Workflow for every stage

1. **Plan.** Read the stage in the build plan. Post a short plan to the human and wait for approval before writing code.
2. **Decompose.** Split the stage into tasks that each touch at most about 5 files and can be verified by a command (test, type check, lint).
3. **Classify each task** using section 3. Critical tasks are done by the master. Routine tasks go to a worker.
4. **Delegate** using the task brief in section 4. Run independent tasks in parallel; never run two workers on the same file.
5. **Review** every worker result before accepting it (section 5).
6. **Gate.** Run the full checks (`npm run typecheck && npm run lint && npm test`, plus `supabase db reset` and the database tests when migrations changed). Summarize what exists, what is stubbed, and what is still open. **Stop and wait for "next stage".**

## 3. What the master keeps (never delegate)

Write these yourself, or rewrite the worker's version line by line:

- Row Level Security policies and their tests
- Any SQL migration that touches money, stock, offers, auth or roles
- Postgres functions and triggers (stock reservation, ledger, payouts, offer state machine)
- Ledger, commission and refund logic
- Webhook handlers (PayMongo, Ninja Van): signature checks and idempotency
- Auth flows, MFA rules, session handling, file-access rules for supplier documents
- Adapter interfaces in `lib/` (payments, shipping, email)
- Anything involving secrets, environment variables or live API keys

## 4. What goes to the worker

UI pages and components, forms with Zod schemas, CRUD actions on non-financial tables, list and detail views, filters and search UI, CSV import parsing, email templates, Playwright tests, non-critical unit tests, documentation, mechanical refactors.

**Every task brief must contain:**

- **Goal:** one sentence
- **Files:** exact paths to create or edit (and which not to touch)
- **Interfaces:** the types, table columns and function signatures to use, copied in full, never "see the plan"
- **Acceptance:** the exact command(s) that must pass, plus expected behavior
- **Rules:** the relevant items from section 6

A task that needs a design decision is not ready to delegate. Make the decision first, then write the brief.

## 5. Reviewing worker output

Haiku is fast but makes confident mistakes. For every result:

1. Read the diff itself, not just the worker's summary.
2. Run the acceptance commands yourself.
3. Check for: money as floats, logic in the browser that should be on the server, missing RLS, missing Zod validation, hardcoded business values, new dependencies nobody asked for, edits outside the listed files, invented API fields.
4. If something is wrong, send back one specific correction (max 2 revision rounds). After that, the master fixes it directly.
5. Reject and redo any task where the worker made up an endpoint, field or library behavior instead of stopping to ask.

## 6. Worker rules (include in every brief)

- Edit only the files listed. Do not refactor, rename or "improve" anything else.
- Do not add dependencies. If one seems necessary, stop and report.
- Do not make architecture decisions. If the spec is ambiguous, stop and ask rather than guess.
- Never invent PayMongo or Ninja Van endpoints or fields. If unsure, write a clearly marked `TODO` behind the adapter and report it.
- Never use or write live keys. Sandbox keys come from environment variables only.
- Do not run `supabase db push`, deploy commands, or anything touching staging or production.
- Finish with a report: files changed, commands run and results, anything uncertain or left undone.

## 7. Project rules (apply to everyone)

**Stack (fixed):** Next.js App Router + TypeScript, Tailwind, shadcn/ui, Supabase (Postgres, Auth, Storage, Edge Functions, pg_cron), Vercel, PayMongo Platforms, Ninja Van Plugin API, Resend, Sentry, Zod, Vitest, Playwright.

**Migrations:** plain SQL in `supabase/migrations/` via the Supabase CLI (`supabase migration new <name>`). No Alembic, no ORM migrations. RLS, functions and triggers live in these files.

**Architecture rules:**

1. Anything touching money, stock, offers or order status runs on the server (Server Actions or Postgres functions), never in the browser.
2. Money is integer centavos. Never floats.
3. RLS on every table. Users see only their own rows, the other party's rows in a shared deal, and admin rows by sub-role.
4. Ledger, payments, offer events, order status history and audit log are append-only. Fix mistakes with reversing rows.
5. Every create action takes an idempotency key. Webhooks verify signatures and tolerate duplicates.
6. External services sit behind adapters in `lib/`.
7. Business values (fees, commission rate, windows, limits) are admin settings, never hardcoded.

**Business rules to respect:**

- Q1 2027 testing: zero TULAY commission and fees. Build `commission_schedules` at 0%; the rate at checkout is frozen on each order.
- Suppliers pay PayMongo fees (cards 3% + PHP 15, e-wallets 2.5%, online banking 2.5%).
- Supplier payouts release 7 days after delivery; later valid claims are deducted from the next payout.
- COD through Ninja Van. Each supplier connects its own Ninja Pro account by OAuth, so COD cash goes to the supplier. Custom-printed items need an online downpayment first.
- Custom orders: artwork, then proof, then buyer approval, then production. The approved proof is frozen as evidence. Cancellation ends when the proof is approved.
- Return classes: standard, custom, final sale. Report windows (defaults 5, 30 and 60 days) are admin settings.

## 8. Git and safety

- No feature branches for now (owner's decision, 2026-11-09): commit directly to `main`. Each stage ends in a commit the human can push.
- Small commits with clear messages. The master commits; workers do not.
- Never commit secrets. Keep `.env.example` current.
- Production deploys, `db push` to staging or production, and anything using live keys require explicit human approval.

## 9. When to stop and ask the human

- A business rule is missing or contradicts another (see the open items below)
- PayMongo or Ninja Van documentation does not say what you need
- A change would alter the data model, stack or a decision in this file
- Tests fail and the fix is not clear after two attempts

**Open items (build as admin settings, then ask):** commission ramp (start, monthly step, ceiling, notice), COD downpayment % and per-order limit, custom-order cancellation window (2 or 24 hours), restocking fee, support email, final report windows after legal review.

## 10. Build plan

Stages: (1) Foundation, (2) Discovery, (3) Deals, (4) Money, (5) Delivery, (6) After-sales. Full stage contents are in the kickoff prompt and `docs/architecture-plan.md` if present. Do not start a stage until the human says "next stage".
