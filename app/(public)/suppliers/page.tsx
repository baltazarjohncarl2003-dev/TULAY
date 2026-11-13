import { Suspense } from "react";
import { CATEGORIES } from "@/lib/categories";
import { listLiveCatalog, listSuppliers } from "@/lib/data/catalog";
import { SuppliersClient } from "./suppliers-client";

export const metadata = { title: "Suppliers" };

export default async function SuppliersPage() {
  const [suppliers, { products }] = await Promise.all([listSuppliers(), listLiveCatalog()]);
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6">
      <Suspense fallback={null}>
        <SuppliersClient suppliers={suppliers} products={products} categories={CATEGORIES} />
      </Suspense>
    </main>
  );
}

// Awaiting searchParams makes this subtree request-time, so the listing is server-rendered with the real query.
async function Listing({ searchParams }: Search) {
  await searchParams;
  return <SuppliersClient suppliers={approvedSuppliers()} products={publicProducts()} categories={CATEGORIES} />;
}
