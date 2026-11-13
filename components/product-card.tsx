"use client";

import Image from "next/image";
import Link from "next/link";
import { EyeIcon, ScaleIcon } from "lucide-react";
import { toast } from "sonner";
import { CategoryIcon } from "@/components/category-icon";
import { SaveButton } from "@/components/save-button";
import { ApprovedBadge } from "@/components/supplier-card";
import { COMPARE_KEY, COMPARE_MAX, useIdList } from "@/lib/saved";
import type { Product, Supplier } from "@/lib/types";
import { php, qty } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Listing tile. Image and title link to the detail page; `onQuickView` adds a sibling
 * Quick view button (never nested inside the link). `layout="list"` is a horizontal row.
 */
export function ProductCard({
  product,
  supplier,
  onQuickView,
  layout = "grid",
}: {
  product: Product;
  supplier: Supplier | undefined;
  onQuickView?: () => void;
  layout?: "grid" | "list";
}) {
  const { id, title, unit, moq, indicativePriceCentavos, imageUrl, categorySlug, listingType } = product;
  const href = `/products/${id}`;
  const list = layout === "list";
  const compare = useIdList(COMPARE_KEY);
  const comparing = compare.has(id);

  return (
    <article
      className={cn(
        "group relative flex overflow-hidden rounded-lg border bg-card transition-shadow hover:shadow-md",
        list ? "flex-row" : "flex-col",
      )}
    >
      <Link
        href={href}
        tabIndex={-1}
        aria-hidden="true"
        className={cn("relative block shrink-0 bg-accent", list ? "w-32 sm:w-44" : "aspect-square")}
      >
        {imageUrl ? (
          <Image src={imageUrl} alt="" fill unoptimized sizes="(min-width: 1024px) 20vw, 50vw" className="object-cover" />
        ) : (
          <span className="flex h-full min-h-28 items-center justify-center text-primary/70">
            <CategoryIcon slug={categorySlug} className="size-10" />
          </span>
        )}
        {listingType === "service" && (
          <span className="absolute top-2 left-2 rounded bg-ink px-1.5 py-0.5 text-[10px] font-semibold text-ink-foreground uppercase">
            Service
          </span>
        )}
      </Link>
      <SaveButton kind="product" id={id} label={title} className="absolute top-2 right-2 z-10" />

      <div className={cn("flex min-w-0 flex-1 flex-col gap-1", list ? "p-3" : "p-2.5")}>
        <h3 className={cn("text-sm leading-snug", list ? "line-clamp-1 font-medium" : "line-clamp-2")}>
          <Link href={href} className="rounded-md outline-none after:absolute after:inset-0 group-hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:underline">
            {title}
          </Link>
        </h3>
        <p className="text-base font-bold">
          {indicativePriceCentavos === null ? (
            "Ask for price"
          ) : (
            <>
              {php(indicativePriceCentavos)}
              <span className="text-xs font-normal text-muted-foreground"> / {unit}</span>
            </>
          )}
        </p>
        <p className="text-xs text-muted-foreground">
          Min. order: {qty(moq)} {unit}
        </p>
        {supplier && (
          <div className="mt-auto flex flex-col gap-0.5 pt-1 text-xs">
            <span className="truncate text-muted-foreground">
              {supplier.businessName} · {supplier.province}
            </span>
            {supplier.status === "approved" && <ApprovedBadge />}
          </div>
        )}
        {onQuickView && (
          // relative z-10 lifts the button above the title link's full-card overlay.
          <button
            type="button"
            onClick={onQuickView}
            className="relative z-10 mt-1 inline-flex w-fit items-center gap-1 rounded text-xs font-medium text-primary hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <EyeIcon aria-hidden="true" className="size-3.5" />
            Quick view<span className="sr-only">: {title}</span>
          </button>
        )}
        <button
          type="button"
          aria-pressed={comparing}
          onClick={() => {
            if (compare.toggle(id).full) toast(`You can compare up to ${COMPARE_MAX} products`);
          }}
          className="relative z-10 mt-1 inline-flex w-fit items-center gap-1 rounded text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none aria-pressed:text-primary"
        >
          <ScaleIcon aria-hidden="true" className="size-3.5" />
          {comparing ? "Added to compare" : "Compare"}
          <span className="sr-only">: {title}</span>
        </button>
      </div>
    </article>
  );
}
