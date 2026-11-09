"use client";

import Image from "next/image";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { categoryName } from "@/lib/demo/data";
import type { Product } from "@/lib/demo/types";
import { php, qty } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Supplier product tile. Pass `onView` to open a dialog (marketplace);
 * without it the button links to the marketplace search for the product title (home).
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
  return (
    <article className="flex flex-col overflow-hidden rounded-xl border bg-card">
      {imageUrl ? (
        <div className="relative aspect-[4/3] bg-muted">
          <Image src={imageUrl} alt={title} fill unoptimized sizes="(min-width: 640px) 33vw, 100vw" className="object-cover" />
        </div>
      ) : (
        <div
          aria-hidden="true"
          className="flex aspect-[4/3] items-center justify-center bg-accent text-5xl font-bold text-accent-foreground/70"
        >
          {categoryName(categorySlug).charAt(0)}
        </div>
      )}
      <div className="flex flex-1 flex-col gap-2 p-4">
        <span className="text-xs font-medium text-muted-foreground">{supplierName}</span>
        <h3 className="font-semibold leading-snug">{title}</h3>
        <p className="text-sm text-muted-foreground">
          Min. {qty(moq)} {unit}
        </p>
        <p className="mt-auto text-base font-semibold">
          {indicativePriceCentavos === null ? (
            "Ask for price"
          ) : (
            <>
              {php(indicativePriceCentavos)}
              <span className="text-xs font-normal text-muted-foreground"> indicative / {unit}</span>
            </>
          )}
        </p>
        {onView ? (
          <Button className="w-full" onClick={onView}>
            View product
          </Button>
        ) : (
          <Link
            href={`/marketplace?q=${encodeURIComponent(title)}`}
            className={cn(buttonVariants(), "w-full")}
          >
            View product
          </Link>
        )}
      </div>
    </article>
  );
}
