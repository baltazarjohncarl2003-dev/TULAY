import Image from "next/image";
import Link from "next/link";
import { CategoryIcon } from "@/components/category-icon";
import { ApprovedBadge, BUSINESS_TYPE_LABEL } from "@/components/supplier-card";
import { MessageSupplierButton } from "@/components/message-supplier-button";
import { SaveButton } from "@/components/save-button";
import { buttonVariants } from "@/components/ui/button";
import { categoryName } from "@/lib/categories";
import { php, qty } from "@/lib/format";
import type { Product, Supplier } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Wide directory row: supplier facts on the left, up to 4 of its live listings as a strip on the right. */
export function SupplierRow({ supplier, products }: { supplier: Supplier; products: Product[] }) {
  const s = supplier;
  const tiles = products.slice(0, 4);
  return (
    <article className="flex min-w-0 flex-col gap-4 rounded-lg border bg-card p-4 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div
            aria-hidden="true"
            className="flex size-11 shrink-0 items-center justify-center rounded-md bg-accent text-primary"
          >
            <CategoryIcon slug={s.categorySlug} />
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <h3 className="text-card-title truncate">
              <Link href={`/suppliers/${s.id}`} className="hover:underline">
                {s.businessName}
              </Link>
            </h3>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span>
                {BUSINESS_TYPE_LABEL[s.businessType]} · {s.city}, {s.province}
              </span>
              {s.status === "approved" && <ApprovedBadge />}
              {s.yearsOperating !== null && (
                <span>
                  {s.yearsOperating} yrs in business <span className="italic">(self-reported)</span>
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SaveButton kind="supplier" id={s.id} label={s.businessName} />
          <Link
            href={`/suppliers/${s.id}`}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "rounded-full")}
          >
            View profile
          </Link>
          <Link
            href="/buyer/rfqs/new"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "rounded-full")}
          >
            Request quote
          </Link>
          <MessageSupplierButton supplierId={s.id} supplierName={s.businessName} className="rounded-full" />
        </div>
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-[13rem_minmax(0,1fr)]">
        <div className="hidden min-w-0 flex-col gap-3 text-xs md:flex">
          <dl className="grid gap-2">
            <div>
              <dt className="text-muted-foreground">Main category</dt>
              <dd>{categoryName(s.categorySlug)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Typical lead time</dt>
              <dd>{s.leadDays} days</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">MOQ from</dt>
              <dd>{qty(s.moq)}</dd>
            </div>
          </dl>
          <p className="line-clamp-3 text-muted-foreground">{s.description}</p>
        </div>

        <div className="min-w-0">
          {tiles.length > 0 ? (
            <div className="flex gap-3 overflow-x-auto pb-1">
              {tiles.map((p) => (
                <Link
                  key={p.id}
                  href={`/products/${p.id}`}
                  className="group flex w-40 shrink-0 flex-col gap-1.5 sm:w-44"
                >
                  <span className="relative block aspect-square overflow-hidden rounded-md bg-accent">
                    {p.imageUrl ? (
                      <Image
                        src={p.imageUrl}
                        alt=""
                        fill
                        unoptimized
                        sizes="11rem"
                        className="object-cover"
                      />
                    ) : (
                      <span className="flex h-full items-center justify-center text-primary/70">
                        <CategoryIcon slug={p.categorySlug} className="size-8" />
                      </span>
                    )}
                  </span>
                  <span className="line-clamp-2 text-xs font-medium group-hover:underline">{p.title}</span>
                  <span className="price text-sm">
                    {p.indicativePriceCentavos === null ? "Price on request" : php(p.indicativePriceCentavos)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Min. order: {qty(p.moq)} {p.unit}
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No live listings yet.</p>
          )}
        </div>
      </div>
    </article>
  );
}
