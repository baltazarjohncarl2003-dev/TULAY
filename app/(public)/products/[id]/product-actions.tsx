"use client";

import { ScaleIcon } from "lucide-react";
import { toast } from "sonner";
import { SaveButton } from "@/components/save-button";
import { Button } from "@/components/ui/button";
import { COMPARE_KEY, COMPARE_MAX, useIdList } from "@/lib/saved";

/** Save and compare from the product page, same stores as the card buttons. */
export function ProductActions({ id, title }: { id: string; title: string }) {
  const compare = useIdList(COMPARE_KEY);
  const comparing = compare.has(id);
  return (
    <div className="flex items-center gap-2">
      <SaveButton kind="product" id={id} label={title} />
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-pressed={comparing}
        onClick={() => {
          if (compare.toggle(id).full) toast(`You can compare up to ${COMPARE_MAX} products`);
        }}
      >
        <ScaleIcon aria-hidden="true" />
        {comparing ? "Added to compare" : "Compare"}
      </Button>
    </div>
  );
}
