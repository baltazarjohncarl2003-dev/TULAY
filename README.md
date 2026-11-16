# TULAY

Philippine B2B marketplace; custom print and packaging is the launch focus. Next.js + Supabase. See `CLAUDE.md` for project rules, `docs/architecture-plan.md` for the design and `docs/style-guide.md` for UI conventions.

## Local setup

Needs Node 24 and Docker.

```sh
npm install
supabase start                 # local stack on ports 544xx
cp .env.example .env.local     # fill keys from `supabase status`
npm run dev
```

Checks: `npm run typecheck && npm run lint && npm test && npm run build`.
