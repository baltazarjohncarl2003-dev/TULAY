"use client";

import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/common";
import { ProductCard } from "@/components/product-card";
import { SupplierCard } from "@/components/supplier-card";
import { useSavedItems } from "@/components/saved-items-provider";
import { buttonVariants } from "@/components/ui/button";
import type { Product, Supplier } from "@/lib/types";

export function SavedClient({ products, suppliers }: { products: Product[]; suppliers: Supplier[] }) {
  const { ids } = useSavedItems();
  const prods = products.filter((p) => ids("product").includes(p.id));
  const sups = suppliers.filter((s) => ids("supplier").includes(s.id));

  return (
    <>
      <PageHeader
        title="Saved"
        description="Products and suppliers you want to come back to. Saved in this browser only."
      />

      <section aria-labelledby="saved-products" className="mb-10">
        <h2 id="saved-products" className="mb-3 text-lg font-semibold">
          Saved products
        </h2>
        {prods.length ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
            {prods.map((p) => (
              <ProductCard key={p.id} product={p} supplier={suppliers.find((s) => s.id === p.supplierId)} />
            ))}
          </div>
        ) : (
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
                mainProducts={products
                  .filter((p) => p.supplierId === s.id)
                  .slice(0, 3)
                  .map((p) => p.title)}
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
