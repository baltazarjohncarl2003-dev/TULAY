"use client";

import { useEffect, useRef, useState } from "react";
import { ProductCard } from "@/components/product-card";
import { Button } from "@/components/ui/button";
import type { Product, Supplier } from "@/lib/types";

const PAGE = 20;

// shortcut: the whole live catalog is sent to the browser and revealed 20 at a time; switch to server-side
// pages (cursor on created_at) once listings reach the thousands.
/** Endless "Recommended" grid: loads more as you scroll, with a button for keyboard users and no-scroll cases. */
export function ProductFeed({ products, suppliers }: { products: Product[]; suppliers: Supplier[] }) {
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
        ) : (
          products.length > PAGE && <p className="text-sm text-muted-foreground">You&apos;ve seen every listing.</p>
        )}
      </div>
    </>
  );
}
