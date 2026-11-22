import { Suspense } from "react";
import { SearchClient } from "./search-client";

export const metadata = { title: "AI Mode" };

export default function SearchPage() {
  return (
    <div className="flex min-w-0 flex-1">
      <Suspense fallback={null}>
        <SearchClient />
      </Suspense>
    </div>
  );
}
