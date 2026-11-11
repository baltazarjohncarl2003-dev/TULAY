"use client";

import Image from "next/image";
import Link from "next/link";
import { categoryName } from "@/lib/demo/data";
import type { Product } from "@/lib/demo/types";
import { php, qty } from "@/lib/format";

const rootClass =
  "group flex flex-col overflow-hidden rounded-lg bg-card text-left border hover:shadow-md transition-shadow focus-visible:ring-[3px] focus-visible:ring-ring/50 outline-none";

/**
 * Supplier product tile. The whole tile is the click target. Pass `onView` to open a dialog
 * (marketplace); without it the tile links to the marketplace search for the product title (home).
 */
export function ProductCard({
  product,
  supplierName,
  onView,
}: {
  product: Product;
  supplierName: string;
  onView?: () => void;
}) {
  const { title, unit, moq, indicativePriceCentavos, imageUrl, categorySlug } = product;
  const content = (
    <>
      {imageUrl ? (
        <span className="relative block aspect-square bg-muted">
          <Image src={imageUrl} alt="" fill unoptimized sizes="(min-width: 1024px) 20vw, 50vw" className="object-cover" />
        </span>
      ) : (
        <span
          aria-hidden="true"
          className="flex aspect-square items-center justify-center bg-accent text-5xl font-bold text-accent-foreground/70"
        >
          {categoryName(categorySlug).charAt(0)}
        </span>
      )}
      <span className="flex flex-1 flex-col gap-1 p-2.5">
        <span className="line-clamp-2 text-sm leading-snug group-hover:underline">{title}</span>
        <span className="text-base font-bold">
          {indicativePriceCentavos === null ? (
            "Ask for price"
          ) : (
            <>
              {php(indicativePriceCentavos)}
              <span className="text-xs font-normal text-muted-foreground"> / {unit}</span>
            </>
          )}
        </span>
        <span className="text-xs text-muted-foreground">
          Min. order: {qty(moq)} {unit}
        </span>
        <span className="truncate text-xs text-muted-foreground">{supplierName}</span>
      </span>
    </>
  );

  return onView ? (
    <button type="button" onClick={onView} className={rootClass}>
      {content}
    </button>
  ) : (
    <Link href={`/marketplace?q=${encodeURIComponent(title)}`} className={rootClass}>
      {content}
    </Link>
  );
}
