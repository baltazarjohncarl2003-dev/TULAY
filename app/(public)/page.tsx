import Image from "next/image";
import Link from "next/link";
import { HandshakeIcon, SearchIcon, TrendingUpIcon } from "lucide-react";
import { CategorySidebar } from "./category-sidebar";
import { HomeCarousel } from "./home-carousel";
import { SwipeRow } from "./swipe-row";
import { CategoryIcon } from "@/components/category-icon";
import { ProductCard } from "@/components/product-card";
import { SupplierCard } from "@/components/supplier-card";
import { buttonVariants } from "@/components/ui/button";
import { LAUNCH_CATEGORIES } from "@/lib/categories";
import { listLiveCatalog } from "@/lib/data/catalog";
import { cn } from "@/lib/utils";

export const metadata = { title: "The bridge to better business" };

// shortcut: curated popular searches with stock photos (Unsplash License) in public/home/popular; move to an
// admin-managed table with search analytics once TULAY records what buyers search for.
const POPULAR = [
  { term: "custom shirts", image: "/home/popular/custom-shirts.jpg" },
  { term: "mailer box", image: "/home/popular/mailer-box.jpg" },
  { term: "coffee beans", image: "/home/popular/coffee-beans.jpg" },
  { term: "POS terminal", image: "/home/popular/pos-terminal.jpg" },
  { term: "office desk", image: "/home/popular/office-desk.jpg" },
  { term: "hotel amenities", image: "/home/popular/hotel-amenities.jpg" },
  { term: "trucking", image: "/home/popular/trucking.jpg" },
];

const RFQ_STEPS = ["Describe your requirement", "Matching suppliers quote", "Compare and choose"];

const WHY = [
  { title: "Discover", Icon: SearchIcon, body: `Search products, suppliers and services across ${LAUNCH_CATEGORIES.length} categories.` },
  { title: "Connect", Icon: HandshakeIcon, body: "Message and request quotes from approved Philippine businesses." },
  { title: "Grow", Icon: TrendingUpIcon, body: "Compare terms and build long-term supplier relationships." },
];

const GRID = "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5";

function SectionHead({ title, href, note }: { title: string; href: string; note?: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h2 className="text-lg font-bold">{title}</h2>
        {note && <span className="text-xs text-muted-foreground">{note}</span>}
      </div>
      <Link href={href} className="text-sm font-medium text-primary hover:underline">
        View all
      </Link>
    </div>
  );
}

export default async function HomePage() {
  const { products: all, suppliers: approved } = await listLiveCatalog();
  const byId = new Map(approved.map((s) => [s.id, s] as const));
  const card = (p: (typeof all)[number]) => <ProductCard key={p.id} product={p} supplier={byId.get(p.supplierId)} />;
  const products = all
    .filter((p) => p.listingType === "product")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 10);
  const services = all.filter((p) => p.listingType === "service");

  // Prefer one supplier per business type, then fill up to 4.
  const seen = new Set<string>();
  const distinct = approved.filter((s) => !seen.has(s.businessType) && seen.add(s.businessType));
  const suppliers = [...distinct, ...approved.filter((s) => !distinct.includes(s))].slice(0, 4);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-10 px-4 py-6">
      <div className="grid gap-4 lg:grid-cols-[15rem_1fr]">
        <div className="hidden lg:block">
          <CategorySidebar />
        </div>
        <div className="flex min-w-0 flex-col gap-3">
          <h1 className="sr-only">TULAY: the bridge to better business</h1>
          <div className="grid flex-1 gap-3 md:grid-cols-[1fr_15rem] lg:grid-cols-[1fr_17rem]">
            <SwipeRow label="Popular searches">
              {POPULAR.map(({ term, image }) => (
                <li key={term} className="flex w-[46%] shrink-0 snap-start p-0.5 sm:w-[31%]">
                  <Link
                    href={`/marketplace?q=${encodeURIComponent(term)}`}
                    className="group flex w-full flex-col gap-3 rounded-xl border bg-card p-3 shadow-xs transition motion-safe:hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <span className="flex flex-col gap-0.5">
                      <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Popular search</span>
                      <span className="text-base leading-tight font-bold capitalize">{term}</span>
                    </span>
                    <span className="relative min-h-36 flex-1 overflow-hidden rounded-lg bg-muted">
                      <Image
                        src={image}
                        alt=""
                        fill
                        sizes="(min-width: 1024px) 15vw, (min-width: 640px) 25vw, 45vw"
                        className="object-cover transition-transform duration-300 motion-safe:group-hover:scale-105"
                      />
                    </span>
                  </Link>
                </li>
              ))}
            </SwipeRow>
            {/* Collapses when there is no active promotion, so it reserves no blank space. */}
            <div className="empty:hidden">
              <HomeCarousel />
            </div>
          </div>
        </div>
      </div>

      <section className="flex flex-col gap-3">
        <SectionHead title="Browse by category" href="/categories" />
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {LAUNCH_CATEGORIES.map((c) => (
            <li key={c.slug}>
              <Link
                href={`/marketplace?category=${c.slug}`}
                className="flex h-full flex-col items-center gap-2 rounded-lg border bg-card p-3 text-center hover:border-primary"
              >
                <span aria-hidden="true" className="flex size-10 items-center justify-center rounded-full bg-accent text-primary">
                  <CategoryIcon slug={c.slug} />
                </span>
                <span className="text-xs font-medium">{c.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <SectionHead title="Recommended products" href="/marketplace" note="Sample listings. Prices are indicative." />
        <div className={GRID}>{products.map(card)}</div>
      </section>

      <section className="flex flex-col gap-3">
        <SectionHead title="Featured suppliers" href="/suppliers" />
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {suppliers.map((s) => (
            <li key={s.id} className="flex">
              <div className="flex-1">
                <SupplierCard
                  supplier={s}
                  mainProducts={all
                    .filter((p) => p.supplierId === s.id)
                    .slice(0, 3)
                    .map((p) => p.title)}
                />
              </div>
            </li>
          ))}
        </ul>
      </section>

      {services.length > 0 && (
        <section className="flex flex-col gap-3">
          <SectionHead title="Business services" href="/marketplace?type=service" />
          <div className={GRID}>{services.map(card)}</div>
        </section>
      )}

      <section className="grid gap-6 rounded-lg border bg-card p-6 md:grid-cols-2 md:items-center">
        <div className="flex flex-col gap-3">
          <h2 className="text-lg font-bold">Tell suppliers what you need. Get quotes.</h2>
          <ol className="flex flex-col gap-2 text-sm">
            {RFQ_STEPS.map((step, i) => (
              <li key={step} className="flex items-center gap-2">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-primary">
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        </div>
        <div className="flex flex-col items-start gap-2 md:items-end">
          <Link href="/buyer/rfqs/new" className={buttonVariants({ size: "lg" })}>
            Post a request
          </Link>
          <span className="text-xs text-muted-foreground">Free for buyers during testing.</span>
        </div>
      </section>

      <section aria-label="Why TULAY" className="grid gap-4 md:grid-cols-3">
        {WHY.map(({ title, Icon, body }) => (
          <div key={title} className="flex gap-3">
            <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-primary">
              <Icon className="size-5" />
            </span>
            <div className="flex flex-col gap-0.5">
              <h2 className="text-base font-bold">{title}</h2>
              <p className="text-sm text-muted-foreground">{body}</p>
            </div>
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-4 rounded-lg bg-primary p-6 text-primary-foreground sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-bold">Reach businesses actively sourcing.</h2>
          <p className="text-sm opacity-90">Supplier approval is required before you appear in search.</p>
        </div>
        <Link href="/register?role=supplier" className={cn(buttonVariants({ size: "lg" }), "shrink-0 bg-white text-primary hover:bg-white/90")}>
          Join as a supplier
        </Link>
      </section>
    </main>
  );
}
