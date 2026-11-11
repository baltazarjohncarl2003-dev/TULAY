import Link from "next/link";
import { CategorySidebar } from "./category-sidebar";
import { HomeCarousel } from "./home-carousel";
import { ProductCard } from "@/components/product-card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { approvedSuppliers, categoryName, publicProducts, supplierById } from "@/lib/demo/data";
import { qty } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata = { title: "Custom print and packaging" };

const TRUST = [
  { title: "One sourcing hub", note: "Everything in one place" },
  { title: "Reviewed supplier profiles", note: "Approval is not a quality guarantee" },
  { title: "Competitive quotations", note: "Compare terms before you choose" },
  { title: "Made for Philippine SMEs", note: "Local sourcing, bigger possibilities" },
];

const STEPS = [
  { title: "Find your product", body: "Browse listings or describe what you need, down to the details." },
  { title: "Get better quotes", body: "Send one sourcing request to matching, opted-in suppliers." },
  { title: "Choose with confidence", body: "Compare pricing, lead times, and terms before selecting a partner." },
];

export default function HomePage() {
  const products = publicProducts();
  const suppliers = approvedSuppliers().slice(0, 4);
  const card = (p: (typeof products)[number]) => (
    <ProductCard key={p.id} product={p} supplierName={supplierById(p.supplierId)?.businessName ?? ""} />
  );

  return (
    <main className="flex flex-1 flex-col">
      <div className="mx-auto grid w-full max-w-6xl gap-4 px-4 pt-4 lg:h-80 lg:grid-cols-[14rem_1fr_16rem]">
        <div className="hidden lg:block">
          <CategorySidebar />
        </div>
        <div className="min-h-64 lg:min-h-0">
          <HomeCarousel />
        </div>
        <aside className="flex flex-col gap-3 rounded-xl border bg-card p-4">
          <h2 className="text-lg font-bold">Welcome to TULAY</h2>
          <p className="text-sm text-muted-foreground">Source custom print and packaging from Philippine suppliers.</p>
          <div className="flex flex-wrap gap-2">
            <Link href="/login" className={buttonVariants()}>
              Sign in
            </Link>
            <Link href="/login?role=supplier" className={buttonVariants({ variant: "outline" })}>
              Join as supplier
            </Link>
          </div>
          <div className="mt-auto flex flex-col gap-1 rounded-lg bg-primary/10 p-3 text-sm">
            <span>Request for quotation: tell suppliers what you need and compare quotes</span>
            <Link href="/buyer/rfqs/new" className="font-semibold text-primary hover:underline">
              Post a request
            </Link>
          </div>
        </aside>
      </div>

      <section aria-label="Why TULAY" className="mt-4 border-y bg-muted/40">
        <ul className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-4 px-4 py-6 sm:grid-cols-2 lg:grid-cols-4">
          {TRUST.map((t) => (
            <li key={t.title} className="flex flex-col gap-0.5">
              <strong className="text-sm font-semibold">{t.title}</strong>
              <span className="text-xs text-muted-foreground">{t.note}</span>
            </li>
          ))}
        </ul>
      </section>

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-4 py-8">
        <section className="flex min-w-0 flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-xl font-bold tracking-tight">Top picks</h2>
            <Link href="/marketplace" className="text-sm font-medium text-primary hover:underline">
              View more
            </Link>
          </div>
          <div className="flex snap-x gap-3 overflow-x-auto pb-2">
            {products.slice(0, 10).map((p) => (
              <div key={p.id} className="w-44 shrink-0 snap-start">
                {card(p)}
              </div>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-xl font-bold tracking-tight">Approved suppliers</h2>
            <Link href="/suppliers" className="text-sm font-medium text-primary hover:underline">
              View all
            </Link>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {suppliers.map((s) => (
              <li key={s.id} className="flex flex-col gap-2 rounded-xl border bg-card p-4 text-sm">
                <strong className="font-semibold">{s.businessName}</strong>
                <Badge className="w-fit">Approved supplier</Badge>
                <span className="text-muted-foreground">
                  {s.city}, {s.province}
                </span>
                <span>{categoryName(s.categorySlug)}</span>
                <span className="text-xs text-muted-foreground">
                  MOQ {qty(s.moq)} · Lead time {s.leadDays} days
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="flex flex-col gap-4 rounded-2xl bg-primary p-6 text-primary-foreground sm:flex-row sm:items-center sm:justify-between sm:p-10">
          <div className="flex flex-col gap-2">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">One request, multiple quotations</h2>
            <p className="max-w-2xl text-sm opacity-90">
              Describe your product once. Matching approved suppliers send you quotes to compare.
            </p>
          </div>
          <Link href="/buyer/rfqs/new" className={cn(buttonVariants({ size: "lg" }), "shrink-0 bg-white text-primary hover:bg-white/90")}>
            Request a quote
          </Link>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-bold tracking-tight">Just for you</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">{products.map(card)}</div>
        </section>

        <section className="flex flex-col gap-6 rounded-2xl bg-muted/40 p-6 sm:p-10">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold tracking-wide text-primary uppercase">Simple by design</span>
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">From &ldquo;what if&rdquo; to &ldquo;what&apos;s next.&rdquo;</h2>
          </div>
          <ol className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="flex flex-col gap-2 rounded-xl border bg-card p-5">
                <span className="text-sm font-bold text-primary">0{i + 1}</span>
                <h3 className="font-semibold">{s.title}</h3>
                <p className="text-sm text-muted-foreground">{s.body}</p>
              </li>
            ))}
          </ol>
          <div>
            <Link href="/how-it-works" className={buttonVariants({ variant: "outline" })}>
              See how TULAY works
            </Link>
          </div>
        </section>

        <section className="flex flex-col gap-4 rounded-2xl bg-primary p-6 text-primary-foreground sm:flex-row sm:items-center sm:justify-between sm:p-10">
          <div className="flex flex-col gap-2">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Good products deserve great opportunities.</h2>
            <p className="max-w-2xl text-sm opacity-90">
              Showcase what you offer and connect with businesses actively sourcing. Supplier approval is required before
              invitations.
            </p>
          </div>
          <Link href="/login?role=supplier" className={cn(buttonVariants({ size: "lg" }), "shrink-0 bg-white text-primary hover:bg-white/90")}>
            Join as a supplier
          </Link>
        </section>
      </div>
    </main>
  );
}
