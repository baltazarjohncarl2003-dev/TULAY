import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import {
  GitCompareIcon,
  LockKeyholeIcon,
  RotateCcwIcon,
  SearchIcon,
  ShieldCheckIcon,
  TruckIcon,
  WalletIcon,
} from "lucide-react";
import { CategoryIcon } from "@/components/category-icon";
import { SupplierCard } from "@/components/supplier-card";
import { buttonVariants } from "@/components/ui/button";
import { LAUNCH_CATEGORIES } from "@/lib/categories";
import { listLiveCatalog } from "@/lib/data/catalog";
import { getNumberSettings } from "@/lib/data/settings";

export const metadata: Metadata = {
  title: "For Buyers",
  description:
    "Find approved Philippine suppliers on TULAY, compare quotes and pay securely. TULAY never holds your money.",
  alternates: { canonical: "/buyers" },
  openGraph: {
    title: "Source from Approved Philippine Suppliers · TULAY",
    description:
      "Find approved Philippine suppliers on TULAY, compare quotes and pay securely. TULAY never holds your money.",
    url: "/buyers",
  },
};

const STEPS = [
  {
    title: "Search",
    Icon: SearchIcon,
    body: "Browse live listings by category, or search for the product or service you need.",
  },
  {
    title: "Compare Quotes",
    Icon: GitCompareIcon,
    body: "Compare prices and terms from approved suppliers, or post a request for quotation.",
  },
  {
    title: "Pay Securely",
    Icon: WalletIcon,
    body: "Pay by card, e-wallet or online banking through PayMongo; TULAY never holds your money.",
  },
  {
    title: "Track Delivery",
    Icon: TruckIcon,
    body: "Ninja Van delivers your order and gives you tracking from pickup to handover.",
  },
];

const WINDOWS = ["report_window_damage_days", "report_window_return_days", "report_window_defect_days"] as const;

const CARD = "flex flex-col gap-3 rounded-lg border bg-card p-6";
const ICON = "flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-primary";

export default async function BuyersPage() {
  const { products, suppliers } = await listLiveCatalog();
  const featured = suppliers.slice(0, 4);

  return (
    <main className="flex flex-1 flex-col">
      <section aria-labelledby="buyers-hero-title" className="bg-accent">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-12 sm:py-16">
          <p className="text-sm font-semibold text-primary">For Buyers</p>
          <h1 id="buyers-hero-title" className="text-display tracking-tight">
            Source from Approved Philippine Suppliers
          </h1>
          <p className="max-w-2xl text-body">
            Find products and services from approved Philippine businesses, compare their terms, and pay through PayMongo
            with tracked delivery.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link href="/marketplace" className={buttonVariants({ size: "lg" })}>
              Start Sourcing
            </Link>
            <Link href="/buyer/rfqs/new" className={buttonVariants({ variant: "outline", size: "lg" })}>
              Post a Request for Quotation
            </Link>
          </div>
        </div>
      </section>

      <section aria-labelledby="how-buying-works-title">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-12">
          <h2 id="how-buying-works-title" className="text-heading">
            How Buying Works
          </h2>
          <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map(({ title, Icon, body }, i) => (
              <li key={title} className={CARD}>
                <div className="flex items-center gap-3">
                  <span aria-hidden="true" className={ICON}>
                    <Icon className="size-5" />
                  </span>
                  <span className="text-sm font-bold text-muted-foreground">Step {i + 1}</span>
                </div>
                <h3 className="text-card-title">{title}</h3>
                <p className="text-sm text-muted-foreground">{body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section aria-labelledby="featured-categories-title">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pb-12">
          <h2 id="featured-categories-title" className="text-heading">
            Featured Categories
          </h2>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {LAUNCH_CATEGORIES.map((c) => (
              <li key={c.slug}>
                <Link
                  href={`/marketplace?category=${c.slug}`}
                  className="flex items-center gap-3 rounded-lg border bg-card p-4 transition hover:border-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <CategoryIcon slug={c.slug} className="size-6" />
                  <span className="min-w-0 text-card-title">{c.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {featured.length > 0 && (
        <section aria-labelledby="featured-suppliers-title">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pb-12">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 id="featured-suppliers-title" className="text-heading">
                Featured Suppliers
              </h2>
              <Link href="/suppliers" className="text-sm font-medium text-primary hover:underline">
                View All
              </Link>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {featured.map((s) => (
                <li key={s.id} className="flex">
                  <div className="flex-1">
                    <SupplierCard
                      supplier={s}
                      mainProducts={products
                        .filter((p) => p.supplierId === s.id)
                        .slice(0, 3)
                        .map((p) => p.title)}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <section aria-labelledby="buy-with-confidence-title">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pb-12">
          <h2 id="buy-with-confidence-title" className="text-heading">
            Buy with Confidence
          </h2>
          <div className="grid gap-4 md:grid-cols-3">
            <article className={CARD}>
              <span aria-hidden="true" className={ICON}>
                <LockKeyholeIcon className="size-5" />
              </span>
              <h3 className="text-card-title">Secure Payment</h3>
              <p className="text-sm text-muted-foreground">
                Payments are processed by PayMongo. TULAY never holds your money.
              </p>
            </article>
            <article className={CARD}>
              <span aria-hidden="true" className={ICON}>
                <ShieldCheckIcon className="size-5" />
              </span>
              <h3 className="text-card-title">Buyer Protection</h3>
              <p className="text-sm text-muted-foreground">
                For custom orders, you approve the proof before production starts. Claims go to the supplier first, and
                TULAY steps in if you cannot agree.
              </p>
            </article>
            <Suspense fallback={null}>
              <ReturnsCard />
            </Suspense>
          </div>
        </div>
      </section>

      <section aria-labelledby="buyers-cta-title" className="bg-ink text-ink-foreground">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-12 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-2">
            <h2 id="buyers-cta-title" className="text-heading">
              Need Something Specific?
            </h2>
            <p className="text-body opacity-90">
              Post a request for quotation and matching suppliers can send you their quotes.
            </p>
          </div>
          <Link href="/buyer/rfqs/new" className={buttonVariants({ size: "lg" })}>
            Post a Request for Quotation
          </Link>
        </div>
      </section>
    </main>
  );
}

// Windows are admin settings read at request time; never hardcode the day counts.
async function ReturnsCard() {
  const w = await getNumberSettings(WINDOWS);
  return (
    <article className={CARD}>
      <span aria-hidden="true" className={ICON}>
        <RotateCcwIcon className="size-5" />
      </span>
      <h3 className="text-card-title">Returns</h3>
      <p className="text-sm text-muted-foreground">Report windows count from the Ninja Van delivery date.</p>
      <ul className="flex flex-col gap-1 text-sm">
        <li>
          <strong>{w.report_window_damage_days} days</strong> for damaged, wrong or missing items
        </li>
        <li>
          <strong>{w.report_window_return_days} days</strong> for change-of-mind returns on standard items
        </li>
        <li>
          <strong>{w.report_window_defect_days} days</strong> for print defects
        </li>
      </ul>
      <Link href="/returns" className="mt-auto pt-1 text-sm font-medium text-primary hover:underline">
        Read the Returns Policy
      </Link>
    </article>
  );
}
