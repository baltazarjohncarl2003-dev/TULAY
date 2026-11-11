import { Suspense } from "react";
import { approvedSuppliers, CATEGORIES, publicProducts } from "@/lib/demo/data";
import { CompareClient } from "./compare-client";

export const metadata = { title: "Compare products" };

export default function ComparePage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6">
      <Suspense>
        <CompareClient products={publicProducts()} suppliers={approvedSuppliers()} categories={CATEGORIES} />
      </Suspense>
    </main>
  );
}
