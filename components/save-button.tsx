"use client";

import { HeartIcon } from "lucide-react";
import { useSavedItems } from "@/components/saved-items-provider";
import { cn } from "@/lib/utils";

export function SaveButton({
  kind,
  id,
  label,
  className,
}: {
  kind: "product" | "supplier";
  id: string;
  label: string;
  className?: string;
}) {
  const { isSaved, toggle } = useSavedItems();
  const saved = isSaved(kind, id);
  const text = `Save ${label}`;
  return (
    <button
      type="button"
      aria-pressed={saved}
      aria-label={text}
      title={text}
      onClick={() => toggle(kind, id)}
      className={cn(
        "inline-flex size-8 shrink-0 items-center justify-center rounded-full border bg-card/90 text-muted-foreground hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
        className,
      )}
    >
      <HeartIcon aria-hidden="true" className={cn("size-4", saved && "fill-current text-primary")} />
    </button>
  );
}
