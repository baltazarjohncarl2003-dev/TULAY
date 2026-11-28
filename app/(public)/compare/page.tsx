import { Suspense } from "react";
import { CATEGORIES } from "@/lib/categories";
import { listLiveProductsByIds } from "@/lib/data/catalog";
import { COMPARE_MAX } from "@/lib/compare";
import { CompareClient } from "./compare-client";

export const metadata = { title: "Compare Products" };

export default async function ComparePage({ searchParams }: { searchParams: Promise<{ ids?: string | string[] }> }) {
  const { ids: param } = await searchParams;
  const raw = typeof param === "string" ? param : "";
  const ids = [...new Set(raw.split(",").filter(Boolean))].slice(0, COMPARE_MAX);
  const { products, suppliers } = ids.length ? await listLiveProductsByIds(ids) : { products: [], suppliers: [] };
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6">
      <Suspense>
        <CompareClient initial={{ ids, products, suppliers }} categories={CATEGORIES} />
      </Suspense>
    </main>
  );
}
