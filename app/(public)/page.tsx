import Link from "next/link";
import { HomeCarousel } from "./home-carousel";
import { ProductCard } from "@/components/product-card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LAUNCH_CATEGORIES, publicProducts, supplierById } from "@/lib/demo/data";
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
  const featured = publicProducts().slice(0, 8);

  return (
    <main className="flex flex-1 flex-col">
      <section className="bg-gradient-to-br from-red-700 to-red-500 text-white">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-16 sm:py-24">
          <p className="text-xs font-semibold tracking-wide sm:text-sm">
            THE SMARTER WAY TO SOURCE CUSTOM PRINT AND PACKAGING IN THE PHILIPPINES
          </p>
          <h1 className="text-4xl leading-tight font-extrabold tracking-tight sm:text-6xl">
            Big ideas.{" "}
            <span className="rounded-lg bg-white px-3 text-primary">Better</span> business.
          </h1>
          <p className="max-w-2xl text-base text-red-50 sm:text-lg">
            Meet your next business supplier. Explore custom print and packaging products, request competitive quotes,
            and build what&apos;s next on one smarter marketplace.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/marketplace" className={cn(buttonVariants({ size: "lg" }), "bg-white text-primary hover:bg-white/90")}>
              Explore marketplace
            </Link>
            <Link href="/buyer/rfqs/new" className={buttonVariants({ variant: "outline", size: "lg" })}>
              Request a quote
            </Link>
          </div>
        </div>
      </section>

      <section aria-label="Why TULAY" className="border-b bg-muted/40">
        <ul className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-4 px-4 py-6 sm:grid-cols-2 lg:grid-cols-4">
          {TRUST.map((t) => (
            <li key={t.title} className="flex flex-col gap-0.5">
              <strong className="text-sm font-semibold">{t.title}</strong>
              <span className="text-xs text-muted-foreground">{t.note}</span>
            </li>
          ))}
        </ul>
      </section>

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-4 py-12">
        <HomeCarousel />

        <section className="flex flex-col gap-6">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold tracking-wide text-primary uppercase">What are you looking for?</span>
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Your next big move starts here.</h2>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Explore categories that help ambitious brands turn ideas into products.
            </p>
          </div>
          <form action="/marketplace" method="get" role="search" className="flex flex-col gap-2 sm:flex-row">
            <Input
              name="q"
              type="search"
              maxLength={140}
              aria-label="Search products"
              placeholder="Try custom coffee pouches, mailer boxes, glass jars"
            />
            <Button type="submit" className="sm:w-auto">
              Find suppliers
            </Button>
          </form>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {LAUNCH_CATEGORIES.map((c) => (
              <li key={c.slug}>
                <Link
                  href={`/marketplace?category=${c.slug}`}
                  className="flex flex-col gap-1 rounded-xl border bg-card p-4 transition-colors hover:bg-muted"
                >
                  <strong className="font-semibold">{c.name}</strong>
                  <span className="text-xs text-muted-foreground">Explore category</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="flex flex-col gap-6">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold tracking-wide text-primary uppercase">Find your fit</span>
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Products that move businesses.</h2>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Browse published listings from approved supplier accounts.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {featured.map((p) => (
              <ProductCard key={p.id} product={p} supplierName={supplierById(p.supplierId)?.businessName ?? ""} />
            ))}
          </div>
          <div>
            <Link href="/marketplace" className={buttonVariants({ variant: "outline" })}>
              Explore marketplace
            </Link>
          </div>
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
