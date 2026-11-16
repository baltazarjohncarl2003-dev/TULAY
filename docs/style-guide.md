# TULAY style guide: casing and type

New screens follow this page. `lib/casing.test.ts` checks every nav label and category name.

## Casing

| Title Case | Sentence case |
| --- | --- |
| Navigation, menus, ribbons, tabs, sidebars, footer links | Body text, descriptions, helper text |
| Category and subcategory names | Form labels and placeholders ("Your business email") |
| Page titles and section headings ("Featured Suppliers") | Error, success and toast messages ("Please fix the highlighted fields.") |
| Primary buttons and calls to action ("Add to Cart", "Request a Quote") | Notices and empty states |
| | Table cells, status pills, metadata ("Paid", "In production") |

- Product and supplier titles appear exactly as the supplier entered them. Never re-case them.
- Small words stay lowercase inside Title Case unless they come first: a, an, and, as, at, but, by, for, in, of, on, or, the, to, with. So "Sign in", "Sell on TULAY", "Request for Quotation".
- Keep acronyms and brand names as written: TULAY, RFQ, DTF, IDs, POS, BIR, DTI, SEC.
- Helpers in `lib/format.ts`: `titleCase()` for labels, `sentence()` for snake_case status values. Do not use the CSS `capitalize` class; it makes Title Case where sentence case belongs.
- Category names live in the `categories` table and in `lib/categories.ts`. Change both together, in Title Case.

## Type scale

Defined once in `app/globals.css` (`@theme`). Use these classes; do not add one-off sizes such as `text-[13px]`.

| Class | Use | Size / weight |
| --- | --- | --- |
| `text-display` | Landing page hero headline | 32–48px, extrabold |
| `text-title` | Page title, one `<h1>` per page | 24–30px, bold |
| `text-heading` | Section heading (`<h2>`) | 20px, bold |
| `text-card-title` | Product, supplier and panel titles | 16px, semibold |
| `text-body` | Long-form body text | 16px, line height 1.625 |
| `text-sm` | Default UI text (lists, tables, forms) | 15px |
| `text-meta` | Captions, timestamps, badges | 13px (`text-xs` is the same size) |
| `text-micro` | Count badges and icon captions only | 12px |

- Weights: bold for headings and prices, medium for buttons and navigation, regular for body text.
- Prices: add the `price` class (bold, tabular numbers) wherever `php()` output is the main figure.
- Body text is never smaller than 15px. Use `text-muted-foreground` for secondary text, not lighter grey.
- Public pages are `max-w-7xl` (1280px) wide, with `px-4` side padding.

## Frontend conventions

- **Server vs client:** `page.tsx` is a Server Component. Put state, forms, filters and dialogs in a `"use client"` file in the same folder (for example `marketplace-client.tsx`) and pass data in as props. Never put `"use client"` in a `page.tsx`.
- **Metadata:** each `page.tsx` exports `export const metadata = { title: "..." }`.
- **Links that look like buttons:** `<Link href=".." className={buttonVariants({ variant: "outline", size: "sm" })}>`. shadcn/ui here is built on Base UI, which has no `asChild`.
- **Dialogs:** controlled, `const [open, setOpen] = useState(false)` with `<Dialog open={open} onOpenChange={setOpen}>`, opened by a normal `<Button onClick={() => setOpen(true)}>`.
- **Money inputs:** `<Input inputMode="decimal" placeholder="0.00">` in pesos. Pre-fill from centavos with `centavosToInput(c)` from `lib/format` (integer math, never `/ 100`). Never `parseFloat` money, and show money only through `php()`.
- **Dynamic routes `[id]`:** `const { id } = await params;` then `notFound()` when missing. Per-user workspace routes (`/buyer`, `/supplier`, `/admin`) must not export `generateStaticParams`.
- **Query strings:** Cache Components is on. A page whose content depends on the query passes `searchParams` into an async child inside `<Suspense>` that awaits it (see `app/(public)/marketplace/page.tsx`).
- No `any`, no `eslint-disable`, no new dependencies.
