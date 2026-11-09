# TULAY

Philippine B2B marketplace for custom print and packaging. Next.js + Supabase. See `CLAUDE.md` for project rules, `docs/architecture-plan.md` for the design and `PARITY.md` for legacy porting status.

## Local setup

Needs Node 24 and Docker.

```sh
npm install
supabase start                 # local stack on ports 544xx
cp .env.example .env.local     # fill keys from `supabase status`
npm run dev
```

Checks: `npm run typecheck && npm run lint && npm test && npm run build`.
