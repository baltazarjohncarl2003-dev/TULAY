"use client";

import { type ReactNode, useEffect, useRef } from "react";
import type { Category } from "@/lib/types";
import { cn } from "@/lib/utils";

const ROW = "flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]";

function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-medium",
        selected ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

/** Top-level chips, then the subcategories of the active top-level category. `value` is "all" or a slug. */
export function CategoryChips({
  categories,
  value,
  onChange,
}: {
  categories: Category[];
  value: string;
  onChange: (slug: string) => void;
}) {
  const topRow = useRef<HTMLDivElement>(null);
  const subRow = useRef<HTMLDivElement>(null);

  const top = categories.filter((c) => c.parentSlug === null);
  const selectedCategory = categories.find((c) => c.slug === value);
  const activeTop = categories.find((c) => c.slug === (selectedCategory?.parentSlug ?? selectedCategory?.slug));
  const subs = activeTop ? categories.filter((c) => c.parentSlug === activeTop.slug) : [];

  // Keeps the selected chip visible on phones, where each row scrolls sideways.
  useEffect(() => {
    for (const row of [topRow.current, subRow.current]) {
      row?.querySelector('[aria-pressed="true"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }, [value]);

  return (
    <nav aria-label="Categories" className="flex flex-col gap-2">
      <div ref={topRow} className={ROW}>
        <Chip selected={value === "all"} onClick={() => onChange("all")}>
          All
        </Chip>
        {top.map((c) => (
          <Chip key={c.slug} selected={activeTop?.slug === c.slug} onClick={() => onChange(c.slug)}>
            {c.name}
          </Chip>
        ))}
      </div>
      {activeTop && (
        <div ref={subRow} className={ROW}>
          <Chip selected={value === activeTop.slug} onClick={() => onChange(activeTop.slug)}>
            All in {activeTop.name}
          </Chip>
          {subs.map((c) => (
            <Chip key={c.slug} selected={value === c.slug} onClick={() => onChange(c.slug)}>
              {c.name}
            </Chip>
          ))}
        </div>
      )}
    </nav>
  );
}
