import { Suspense } from "react";
import { SUPPLIERS, publicProducts } from "@/lib/demo/data";
import { SearchClient } from "./search-client";

export const metadata = { title: "Smart sourcing search" };

export default function SearchPage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-10">
      <Suspense fallback={null}>
        <SearchClient products={publicProducts()} suppliers={SUPPLIERS} />
      </Suspense>
    </main>
  );
}
