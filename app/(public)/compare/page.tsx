import { Suspense } from "react";
import { CATEGORIES } from "@/lib/categories";
import { listLiveCatalog } from "@/lib/data/catalog";
import { CompareClient } from "./compare-client";

export const metadata = { title: "Compare products" };

export default async function ComparePage() {
  const { products, suppliers } = await listLiveCatalog();
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6">
      <Suspense>
        <CompareClient products={products} suppliers={suppliers} categories={CATEGORIES} />
      </Suspense>
    </main>
  );
}
