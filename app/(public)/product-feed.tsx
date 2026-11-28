"use client";

import { useEffect, useRef, useState } from "react";
import { ProductCard } from "@/components/product-card";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { qty } from "@/lib/format";
import type { Product, Supplier } from "@/lib/types";

const PAGE = 20;

// shortcut: the feed holds only the 60 newest products, revealed 20 at a time; the marketplace pages the rest
// on the server. Add server-side pages here only if the home page needs more than 60.
/** Endless "Recommended" grid: loads more as you scroll, with a button for keyboard users and no-scroll cases. */
export function ProductFeed({ products, suppliers, total }: { products: Product[]; suppliers: Supplier[]; total: number }) {
  const [shown, setShown] = useState(PAGE);
  const sentinel = useRef<HTMLDivElement>(null);
  const byId = new Map(suppliers.map((s) => [s.id, s] as const));
  const more = shown < products.length;

  useEffect(() => {
    const el = sentinel.current;
    if (!el || !more) return;
    const observer = new IntersectionObserver(
      ([entry]) => entry.isIntersecting && setShown((n) => n + PAGE),
      { rootMargin: "600px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
    // Re-observe after each page: a fresh observer fires at once if the end is still in view.
  }, [more, shown]);

  return (
    <>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {products.slice(0, shown).map((p) => (
          <li key={p.id} className="flex">
            <ProductCard product={p} supplier={byId.get(p.supplierId)} />
          </li>
        ))}
      </ul>
      <div ref={sentinel} className="flex justify-center">
        {more ? (
          <Button variant="outline" onClick={() => setShown((n) => n + PAGE)}>
            Load more
          </Button>
        ) : total > products.length ? (
          <Link href="/marketplace" className={buttonVariants({ variant: "outline" })}>
            See all {qty(total)} listings
          </Link>
        ) : (
          products.length > PAGE && <p className="text-sm text-muted-foreground">You&apos;ve seen every listing.</p>
        )}
      </div>
    </>
  );
}
