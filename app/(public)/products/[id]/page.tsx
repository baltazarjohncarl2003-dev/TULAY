import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AddToCart } from "@/components/add-to-cart";
import { CategoryIcon } from "@/components/category-icon";
import { Notice, Row } from "@/components/common";
import { ProductCard } from "@/components/product-card";
import { ApprovedBadge, BUSINESS_TYPE_LABEL } from "@/components/supplier-card";
import { buttonVariants } from "@/components/ui/button";
import { CATEGORIES, categoryName } from "@/lib/categories";
import { getProduct, getStorefront, searchProducts } from "@/lib/data/catalog";
import { claimSettings, supplierReviews } from "@/lib/data/claims";
import type { Product, Supplier } from "@/lib/types";
import { label, php, qty } from "@/lib/format";
import { cn } from "@/lib/utils";

const RETURN_COPY: Record<Product["returnClass"], string> = {
  standard: "Standard returns: report issues within the admin-set window after delivery.",
  custom: "Custom-made: no change-of-mind returns once the proof is approved. Defects can be reported.",
  final_sale: "Final sale: no returns except items not as described.",
};

function ratingText(r: { average: number; count: number }) {
  return `★ ${r.average.toFixed(1)} · ${r.count} ${r.count === 1 ? "review" : "reviews"} from verified buyers`;
}

/** Return terms line. The restocking fee is the supplier's ask, capped by the platform (basis points). */
function returnTerms(p: Product, s: Supplier, c: Awaited<ReturnType<typeof claimSettings>>) {
  if (p.returnClass === "custom") return `Made to order: report print defects within ${c.defectDays} days.`;
  if (p.returnClass === "final_sale") return `Final sale: report transit damage within ${c.damageDays} days.`;
  const bps = Math.min(s.restockingFeeBps ?? 0, c.restockingFeeMaxBps);
  if (bps <= 0) return `Change-of-mind returns within ${c.returnDays} days`;
  const pct = `${Math.trunc(bps / 100)}${bps % 100 ? `.${String(bps % 100).padStart(2, "0")}` : ""}`;
  return `Change-of-mind returns within ${c.returnDays} days; restocking fee ${pct}%`;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return { title: (await getProduct(id))?.product.title ?? "Listing" };
}

function Grid({ title, items }: { title: string; items: { product: Product; supplier: Supplier | undefined }[] }) {
  if (items.length === 0) return null;
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {items.map(({ product, supplier }) => (
          <ProductCard key={product.id} product={product} supplier={supplier} />
        ))}
      </div>
    </section>
  );
}

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const found = await getProduct(id);
  if (!found) notFound();
  const p = found.product;
  const s = found.supplier;
  const cat = CATEGORIES.find((c) => c.slug === p.categorySlug);
  const topSlug = cat?.parentSlug ?? p.categorySlug;
  const [storefront, related, reviews, claims] = await Promise.all([
    getStorefront(p.supplierId),
    searchProducts({ category: topSlug, sort: "newest", pageSize: 12 }),
    supplierReviews(s.id),
    claimSettings(),
  ]);
  const moreFromSupplier = (storefront?.products ?? [])
    .filter((x) => x.id !== p.id)
    .slice(0, 5)
    .map((product) => ({ product, supplier: s }));
  const shown = new Set([p.id, ...moreFromSupplier.map((m) => m.product.id)]);
  const similar = related.hits.filter((h) => !shown.has(h.product.id)).slice(0, 4);
  const extraImages = p.imageUrls?.slice(1) ?? [];
  const rfqHref = `/buyer/rfqs/new?product=${p.id}`;
  const crumbs = [...new Set([topSlug, p.categorySlug])];

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 py-6">
      {p.status !== "approved" && (
        <Notice tone="warn">Preview: this listing is {p.status} and is not public yet.</Notice>
      )}
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
          {extraImages.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {extraImages.map((url, i) => (
                <div key={url} className="relative size-16 overflow-hidden rounded-md bg-accent">
                  <Image src={url} alt={`${p.title} photo ${i + 2}`} fill unoptimized sizes="4rem" className="object-cover" />
                </div>
              ))}
            </div>
          )}
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
            <p className="mt-2 text-sm">{returnTerms(p, s, claims)}</p>
          </section>
        </div>

        <aside className="flex flex-col gap-4 self-start rounded-lg border bg-card p-4 lg:sticky lg:top-[var(--header-h)]">
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
            {p.priceTiers?.length ? (
              <div className="mt-3 flex flex-col gap-1">
                <p className="text-sm font-semibold">Volume pricing</p>
                <dl className="divide-y rounded-lg border px-3 [&_div]:py-1">
                  <Row k={`${qty(p.moq)}+ ${p.unit}`} v={p.indicativePriceCentavos === null ? "Quote only" : php(p.indicativePriceCentavos)} />
                  {p.priceTiers.map((t) => (
                    <Row key={t.minQty} k={`${qty(t.minQty)}+ ${p.unit}`} v={php(t.unitPriceCentavos)} />
                  ))}
                </dl>
              </div>
            ) : null}
          </div>
          <AddToCart product={p} />
          <div className="flex flex-col gap-2">
            <Link href={rfqHref} className={buttonVariants()}>
              Request a quote
            </Link>
          </div>
          {s && (
            <div className="flex flex-col gap-1 border-t pt-3 text-sm">
              <Link href={`/suppliers/${s.id}`} className="font-semibold hover:underline">
                {s.businessName}
              </Link>
              {s.status === "approved" && <ApprovedBadge />}
              {reviews.rating !== null && <span className="text-muted-foreground">{ratingText(reviews.rating)}</span>}
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

      <Grid title={`More from ${s?.businessName ?? "this supplier"}`} items={moreFromSupplier} />
      <Grid title="Similar listings" items={similar} />
    </main>
  );
}
