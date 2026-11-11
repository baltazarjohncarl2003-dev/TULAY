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
