"use client";

import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/common";
import { ProductCard } from "@/components/product-card";
import { SupplierCard } from "@/components/supplier-card";
import { useSavedItems } from "@/components/saved-items-provider";
import { Button, buttonVariants } from "@/components/ui/button";
import type { Product, Supplier } from "@/lib/types";

export function SavedClient({ products, suppliers }: { products: Product[]; suppliers: Supplier[] }) {
  const { ids, toggle } = useSavedItems();
  const prods = products.filter((p) => ids("product").includes(p.id));
  const sups = suppliers.filter((s) => ids("supplier").includes(s.id));
  // Saved earlier but not live now (removed, unapproved, supplier suspended). Items saved a moment ago on this
  // page are not in `products` until the next load, so they also show here until then.
  const gone = ids("product").filter((id) => !products.some((p) => p.id === id));

  return (
    <>
      <PageHeader
        title="Saved"
        description="Products and suppliers you want to come back to. Saved to your account."
      />

      <section aria-labelledby="saved-products" className="mb-10">
        <h2 id="saved-products" className="mb-3 text-lg font-semibold">
          Saved products
        </h2>
        {prods.length > 0 && (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
            {prods.map((p) => (
              <ProductCard key={p.id} product={p} supplier={suppliers.find((s) => s.id === p.supplierId)} />
            ))}
          </div>
        )}
        {gone.length > 0 && (
          <ul className="mt-3 flex flex-col gap-2">
            {gone.map((id) => (
              <li key={id} className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
                <span className="text-muted-foreground">This product is no longer available.</span>
                <Button variant="outline" size="sm" onClick={() => toggle("product", id)}>
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
        {prods.length === 0 && gone.length === 0 && (
          <EmptyState title="No saved products yet.">
            <Link href="/marketplace" className={buttonVariants({ variant: "outline" })}>
              Browse the marketplace
            </Link>
          </EmptyState>
        )}
      </section>

      <section aria-labelledby="saved-suppliers">
        <h2 id="saved-suppliers" className="mb-3 text-lg font-semibold">
          Saved suppliers
        </h2>
        {sups.length ? (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {sups.map((s) => (
              <SupplierCard
                key={s.id}
                supplier={s}
              />
            ))}
          </div>
        ) : (
          <EmptyState title="No saved suppliers yet.">
            <Link href="/suppliers" className={buttonVariants({ variant: "outline" })}>
              Browse suppliers
            </Link>
          </EmptyState>
        )}
      </section>
    </>
  );
}
