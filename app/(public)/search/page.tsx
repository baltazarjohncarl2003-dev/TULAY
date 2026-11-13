import { Suspense } from "react";
import { listLiveCatalog } from "@/lib/data/catalog";
import { SearchClient } from "./search-client";

export const metadata = { title: "TULAY AI (preview)" };

export default async function SearchPage() {
  const { products, suppliers } = await listLiveCatalog();
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-10">
      <Suspense fallback={null}>
        <SearchClient products={products} suppliers={suppliers} />
      </Suspense>
    </main>
  );
}

// Awaiting searchParams makes this subtree request-time, so the listing is server-rendered with the real query.
async function Listing({ searchParams }: Search) {
  await searchParams;
  return <SearchClient products={publicProducts()} suppliers={approvedSuppliers()} />;
}
