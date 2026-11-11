import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CategoryIcon } from "@/components/category-icon";
import { Row } from "@/components/common";
import { ProductCard } from "@/components/product-card";
import { ApprovedBadge, BUSINESS_TYPE_LABEL } from "@/components/supplier-card";
import { buttonVariants } from "@/components/ui/button";
import { CATEGORIES, categoryName, publicProducts, supplierById } from "@/lib/demo/data";
import type { Product } from "@/lib/demo/types";
import { label, php, qty } from "@/lib/format";
import { cn } from "@/lib/utils";

const RETURN_COPY: Record<Product["returnClass"], string> = {
  standard: "Standard returns: report issues within the admin-set window after delivery.",
  custom: "Custom-made: no change-of-mind returns once the proof is approved. Defects can be reported.",
  final_sale: "Final sale: no returns except items not as described.",
};

export function generateStaticParams() {
  return publicProducts().map((p) => ({ id: p.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return { title: publicProducts().find((p) => p.id === id)?.title ?? "Listing" };
}

function Grid({ title, products }: { title: string; products: Product[] }) {
  if (products.length === 0) return null;
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {products.map((p) => (
          <ProductCard key={p.id} product={p} supplier={supplierById(p.supplierId)} />
        ))}
      </div>
    </section>
  );
}

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const all = publicProducts();
  const p = all.find((x) => x.id === id);
  if (!p) notFound();
  const s = supplierById(p.supplierId);
  const cat = CATEGORIES.find((c) => c.slug === p.categorySlug);
  const topSlug = cat?.parentSlug ?? p.categorySlug;
  const others = all.filter((x) => x.id !== p.id);
  const moreFromSupplier = others.filter((x) => x.supplierId === p.supplierId).slice(0, 5);
  const similar = others
    .filter((x) => !moreFromSupplier.includes(x))
    .filter((x) => (CATEGORIES.find((c) => c.slug === x.categorySlug)?.parentSlug ?? x.categorySlug) === topSlug)
    .slice(0, 5);
  const rfqHref = `/buyer/rfqs/new?product=${p.id}`;
  const crumbs = [...new Set([topSlug, p.categorySlug])];

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 py-6">
      <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
        <ol className="flex flex-wrap items-center gap-1">
          <li>
            <Link href="/" className="hover:underline">
              Home
            </Link>
          </li>
          {crumbs.map((slug) => (
            <li key={slug} className="flex items-center gap-1">
              <span aria-hidden="true">/</span>
              <Link href={`/marketplace?category=${slug}`} className="hover:underline">
                {categoryName(slug)}
              </Link>
            </li>
          ))}
        </ol>
      </nav>

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-lg bg-accent text-primary/70">
            {p.imageUrl ? (
              <Image src={p.imageUrl} alt={p.title} fill unoptimized sizes="(min-width: 1024px) 40rem, 100vw" className="object-cover" />
            ) : (
              <CategoryIcon slug={p.categorySlug} className="size-24" />
            )}
          </div>
          <h1 className="text-xl font-semibold">{p.title}</h1>
          {p.listingType === "service" && (
            <span className="w-fit rounded bg-ink px-1.5 py-0.5 text-[10px] font-semibold text-ink-foreground uppercase">
              Service
            </span>
          )}
          <p className="text-sm">{p.description}</p>
          <section aria-labelledby="specs">
            <h2 id="specs" className="mb-1 font-semibold">
              Specifications
            </h2>
            <dl className="divide-y rounded-lg border px-3 [&_div]:py-2">
              <Row k="Category" v={categoryName(p.categorySlug)} />
              <Row k="Listing type" v={label(p.listingType)} />
              <Row k="Minimum order" v={`${qty(p.moq)} ${p.unit}`} />
              <Row k="Lead time" v={p.leadDays === null ? "To confirm" : `${p.leadDays} days`} />
              <Row k="Returns" v={RETURN_COPY[p.returnClass]} />
            </dl>
          </section>
        </div>

        <aside className="flex flex-col gap-4 self-start rounded-lg border bg-card p-4 lg:sticky lg:top-32">
          <div>
            <p className="text-2xl font-bold">
              {p.indicativePriceCentavos === null ? (
                "Ask for price"
              ) : (
                <>
                  {php(p.indicativePriceCentavos)}
                  <span className="text-sm font-normal text-muted-foreground"> / {p.unit}</span>
                </>
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              Indicative price. Final price comes in the supplier&apos;s quote.
            </p>
            <p className="mt-1 text-sm">
              Min. order: {qty(p.moq)} {p.unit}
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Link href={rfqHref} className={buttonVariants()}>
              Request a quote
            </Link>
            <Link href={rfqHref} className={buttonVariants({ variant: "outline" })}>
              Contact supplier
            </Link>
          </div>
          {s && (
            <div className="flex flex-col gap-1 border-t pt-3 text-sm">
              <Link href={`/suppliers/${s.id}`} className="font-semibold hover:underline">
                {s.businessName}
              </Link>
              {s.status === "approved" && <ApprovedBadge />}
              <span className="text-muted-foreground">{BUSINESS_TYPE_LABEL[s.businessType]}</span>
              <span className="text-muted-foreground">
                {s.city}, {s.province}
              </span>
              {s.yearsOperating !== null && (
                <span className="text-muted-foreground">{s.yearsOperating} yrs in business (self-reported)</span>
              )}
            </div>
          )}
          <Link href="/contact" className={cn("text-xs text-muted-foreground hover:underline")}>
            Report this listing
          </Link>
        </aside>
      </div>

      <Grid title={`More from ${s?.businessName ?? "this supplier"}`} products={moreFromSupplier} />
      <Grid title="Similar listings" products={similar} />
    </main>
  );
}
