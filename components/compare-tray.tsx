"use client";

import Link from "next/link";
import { COMPARE_KEY, COMPARE_MAX, useIdList } from "@/lib/demo/saved";

export function CompareTray() {
  const { ids, clear } = useIdList(COMPARE_KEY);
  if (ids.length === 0) return null;
  return (
    <div
      role="region"
      aria-label="Compare products"
      className="fixed bottom-16 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-full border bg-card px-4 py-2 text-sm shadow-lg md:bottom-4"
    >
      <span>
        {ids.length} of {COMPARE_MAX} selected
      </span>
      <Link href={`/compare?ids=${ids.map(encodeURIComponent).join(",")}`} className="font-medium text-primary hover:underline">
        Compare
      </Link>
      <button type="button" onClick={clear} className="text-muted-foreground hover:underline">
        Clear
      </button>
    </div>
  );
}
