import Link from "next/link";
import { notFound } from "next/navigation";
import { CategoryIcon } from "@/components/category-icon";
import { EmptyState, Notice, Row } from "@/components/common";
import { ProductCard } from "@/components/product-card";
import { ApprovedBadge, BUSINESS_TYPE_LABEL } from "@/components/supplier-card";
import { buttonVariants } from "@/components/ui/button";
import { categoryName } from "@/lib/categories";
import { getStorefront } from "@/lib/data/catalog";
import { qty } from "@/lib/format";
import { cn } from "@/lib/utils";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return { title: (await getStorefront(id))?.supplier.businessName ?? "Supplier" };
}

export default async function SupplierPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const found = await getStorefront(id);
  if (!found) notFound();
  const s = found.supplier;
  const products = found.products;
  const location = [s.city, s.province].filter(Boolean).join(", ");

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6">
      <header className="flex flex-col gap-4 rounded-lg bg-ink p-6 text-ink-foreground sm:flex-row sm:items-center">
        <div
          aria-hidden="true"
          className="flex size-20 shrink-0 items-center justify-center rounded-lg bg-accent text-primary"
        >
          <CategoryIcon slug={s.categorySlug} className="size-10" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h1 className="text-2xl font-semibold">{s.businessName}</h1>
          <p className="text-sm">
            {BUSINESS_TYPE_LABEL[s.businessType]} · {categoryName(s.categorySlug)}
          </p>
          <ApprovedBadge className="text-ink-foreground" />
          <p className="text-sm">{location}</p>
        </div>
        <div className="flex flex-col gap-2 sm:w-44">
          <Link href="/buyer/rfqs/new" className={cn(buttonVariants(), "bg-white text-ink hover:bg-white/90")}>
            Request a quote
          </Link>
          <Link
            href="/buyer/rfqs/new"
            className={cn(buttonVariants({ variant: "outline" }), "border-white/40 bg-transparent text-ink-foreground hover:bg-white/10")}
          >
            Contact supplier
          </Link>
        </div>
      </header>

      <nav aria-label="Sections" className="flex gap-4 border-b pb-2 text-sm font-medium">
        <a href="#overview" className="hover:underline">Overview</a>
        <a href="#products" className="hover:underline">Products &amp; services</a>
        <a href="#info" className="hover:underline">Business info</a>
      </nav>

      <section id="overview" className="flex scroll-mt-32 flex-col gap-2">
        <h2 className="text-lg font-semibold">Overview</h2>
        <p className="text-sm">{s.description}</p>
        <Row k="Registered name" v={s.legalName} />
      </section>

      <section id="products" className="flex scroll-mt-32 flex-col gap-3">
        <h2 className="text-lg font-semibold">Products &amp; services</h2>
        {products.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {products.map((p) => (
              <ProductCard key={p.id} product={p} supplier={s} />
            ))}
          </div>
        ) : (
          <EmptyState title="No listings published yet." />
        )}
      </section>

      <section id="info" className="flex scroll-mt-32 flex-col gap-3">
        <h2 className="text-lg font-semibold">Business info</h2>
        <dl className="divide-y rounded-lg border px-3 [&_div]:py-2">
          <Row k="Business type" v={BUSINESS_TYPE_LABEL[s.businessType]} />
          <Row k="Main category" v={categoryName(s.categorySlug)} />
          <Row k="Location" v={location} />
          <Row k="Areas served" v={s.deliveryAreas.join(", ")} />
          <Row k="Typical MOQ" v={qty(s.moq)} />
          <Row k="Typical lead time" v={`${s.leadDays} days`} />
          <Row k="Max order capacity" v={s.maxQuantity === null ? "Not stated" : qty(s.maxQuantity)} />
          <Row k="Years in business" v={s.yearsOperating === null ? "Not stated" : `${s.yearsOperating} (self-reported)`} />
        </dl>
        <Notice>
          TULAY reviews business documents before approval. Approval is not a guarantee of quality or performance.
          Verify details before you commit to an order.
        </Notice>
      </section>
    </main>
  );
}
