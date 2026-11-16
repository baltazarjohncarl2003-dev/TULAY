import { Suspense } from "react";
import { SearchClient } from "./search-client";

export const metadata = { title: "AI Mode" };

export default function SearchPage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-10">
      <Suspense fallback={null}>
        <SearchClient />
      </Suspense>
    </main>
  );
}
