import { Suspense } from "react";
import { SearchClient } from "./search-client";

export const metadata = { title: "AI Mode" };

export default function SearchPage() {
  return (
    <main id="main" className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pt-6 pb-60">
      <Suspense fallback={null}>
        <SearchClient />
      </Suspense>
    </main>
  );
}
