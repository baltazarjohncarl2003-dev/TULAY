# Frontend demo brief (shared by all worker tasks)

Repo: `C:\Users\Luis Oliver\source\repos\TULAY`. Next.js 16.4.5 App Router, React 19, TypeScript, Tailwind 4, shadcn/ui (built on **Base UI**, not Radix), Zod 4.

We are building the **frontend only**. There is no backend yet: every screen reads static sample data from `lib/demo/data.ts`, and every form or action button only validates and shows a toast ("Demo mode: not saved yet"). Nothing is persisted, fetched, or sent anywhere.

We are rebuilding screens from the legacy app "BUYSON" (spec: `legacy/apps-script/Client.html`, read-only, line ranges given in your task). Rebuild the **content, fields, filters, buttons and behaviour**, but with TULAY branding:
- Never write "BUYSON", "Buyson", "bison" or purple. Use "TULAY". Theme is red via tokens.
- Do not copy legacy CSS or class names. Use Tailwind utilities and theme tokens: `bg-primary text-primary-foreground`, `text-primary`, `bg-accent text-accent-foreground`, `bg-muted`, `text-muted-foreground`, `border`, `bg-card`.
- Mobile-first: one column on phones, grids at `sm:`/`md:`/`lg:`. Wrap tables in `<div className="overflow-x-auto">`.
- Plain, friendly copy. Keep legacy honesty notes (e.g. "indicative price", "approval is not a quality guarantee", "TULAY does not hold buyer money").

## Read these files first (do NOT edit them)

- `lib/demo/types.ts` — all types. Money fields end in `Centavos` and are integers.
- `lib/demo/data.ts` — `CATEGORIES`, `LAUNCH_CATEGORIES`, `DEMO_USERS` (keys `buyer|supplier|admin`), `SUPPLIERS`, `PRODUCTS`, `PROMOTIONS`, `RFQS`, `INVITES`, `QUOTES`, `OFFERS`, `MESSAGES`, `NOTIFICATIONS`, `SELECTIONS`, and helpers `categoryName(slug)`, `supplierById(id)`, `rfqById(id)`, `approvedSuppliers()`, `publicProducts()`, `latestQuotes(rfqId)`, `DEMO_SUPPLIER` (the signed-in supplier's company, id `s1`).
- `lib/format.ts` — `php(centavos|null)` (only way to display money), `toCentavos(text)`, `qty(n)`, `date(iso)`, `label(snake_case)`, `quoteKnownTotal(quote) -> {totalCentavos, partial}`.
- `lib/validation/forms.ts` — Zod schemas. Use the one your task names. Form field `name`s must equal the schema keys exactly.
- `components/form.tsx` (client) — `useDemoForm(schema, successMessage, onValid?) -> { errors, onSubmit }`; `demoAction(message)` for non-form buttons (approve, decline...); `Field({label, name, errors, hint?, className?, children})`; `NativeSelect` (styled `<select>`).
- `components/common.tsx` — `PageHeader({eyebrow?, title, description?, actions?})`, `StatusPill({status})`, `EmptyState({title, children?})`, `Notice({tone?: "info"|"warn", children})`, `Row({k, v})`.
- `components/ui/*` — `Button`, `buttonVariants`, `Input`, `Textarea`, `Label`, `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`, `Badge`, `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell`, `Dialog`, `DialogTrigger`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter`, `DialogClose`.

## Conventions

- **Demo identity:** signed-in buyer = `DEMO_USERS.buyer` (id `u-buyer`); supplier = `DEMO_USERS.supplier` (id `u-supplier`) owning `DEMO_SUPPLIER` (`s1`); admin = `DEMO_USERS.admin` (id `u-admin`).
- **Server vs client:** `page.tsx` is a Server Component. Put state, forms, filters and dialogs in a `"use client"` file in the same folder (e.g. `marketplace-client.tsx`) and pass data in as props.
- **Links that look like buttons:** `<Link href=".." className={buttonVariants({ variant: "outline", size: "sm" })}>`. Base UI has no `asChild`.
- **Dialogs:** controlled `const [open, setOpen] = useState(false)` and `<Dialog open={open} onOpenChange={setOpen}>`, opened by a normal `<Button onClick={() => setOpen(true)}>`. `<DialogContent className="sm:max-w-lg">`.
- **Forms:** `const { errors, onSubmit } = useDemoForm(schema, "Message")`; `<form onSubmit={onSubmit} noValidate>`. Each input has `id` and `name` equal to the schema key, wrapped in `<Field label name errors>`. Checkboxes: native `<input type="checkbox" name=".." className="size-4 accent-primary" />` (not the shadcn Checkbox). Money inputs: `<Input inputMode="decimal" placeholder="0.00">` in pesos; when pre-filling from centavos use `centavosToInput(c)` from `lib/format` (integer math; never `/ 100`). Never `parseFloat` money and never show money except through `php()`.
- **Dynamic routes `[id]`:** public pages (products, suppliers) may `export function generateStaticParams()` over the public list; per-user workspace routes (`/buyer`, `/supplier`, `/admin`) must not. `export default async function Page({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; ... notFound() if missing }`.
- **Query strings:** Cache Components is on. For pages whose content depends on the query (catalog, search), the page passes `searchParams` into an async child inside `<Suspense>` that awaits it, so the result is server-rendered (see `app/(public)/marketplace/page.tsx`). Client controls may still use `useSearchParams()`.
- **Metadata:** each `page.tsx` exports `export const metadata = { title: "..." }`. Never put `"use client"` in a `page.tsx`.
- No `any`. No `eslint-disable`. No new dependencies.

## Route map (link only to these)

Public: `/`, `/how-it-works`, `/marketplace` (`?q=`, `?category=slug`), `/search` (`?q=`), `/suppliers`, `/login` (`?role=buyer|supplier`).
Buyer: `/buyer`, `/buyer/rfqs`, `/buyer/rfqs/new` (`?product=<productId>` prefill, `?draft=<rfqId>` edit draft), `/buyer/rfqs/[id]`, `/buyer/messages`, `/buyer/account`.
Supplier: `/supplier`, `/supplier/products`, `/supplier/profile`, `/supplier/auto-matching`, `/supplier/invites`, `/supplier/quotes`, `/supplier/rfqs/[id]`, `/supplier/rfqs/[id]/quote`, `/supplier/messages`, `/supplier/account`.
Admin: `/admin`, `/admin/products`, `/admin/promotions`, `/admin/rfqs`, `/admin/rfqs/[id]`, `/admin/suppliers`, `/admin/transactions`, `/admin/messages`, `/admin/account`.
Layouts already exist for every group (header, sidebar, demo banner, toaster). Pages render only their own content.

## Rules

- Edit or create **only** the files listed in your task. Do not refactor, rename or "improve" anything else, including the shared files above.
- Do not add dependencies. If one seems necessary, stop and report.
- Do not make architecture decisions. If the spec is ambiguous, pick the simplest option that matches the legacy screen and list it in your report.
- Never use live keys, never run deploy commands or `supabase db push`, never commit.
- Other workers are editing other files at the same time. Do **not** run `npm run build` or `npm run dev`.

## Acceptance

Run `npm run typecheck` and `npm run lint`. Both must pass for your files. If an error is in a file you do not own, report it and do not touch it.

Finish with a report: files changed, commands run with results, anything uncertain, simplified or left out.
