"use client";

import { useRef } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Horizontal scroll-snap strip: swipe on touch, arrow buttons for mouse users. */
export function SwipeRow({ label, children }: { label: string; children: React.ReactNode }) {
  const ref = useRef<HTMLUListElement>(null);
  const scroll = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.9, behavior: "smooth" });

  return (
    <div className="relative flex min-w-0">
      <ul
        ref={ref}
        aria-label={label}
        className="flex flex-1 snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </ul>
      <Button
        variant="outline"
        size="icon"
        aria-label="Scroll left"
        onClick={() => scroll(-1)}
        className="absolute top-1/2 -left-3 hidden size-8 -translate-y-1/2 rounded-full bg-background/90 shadow-sm backdrop-blur md:inline-flex"
      >
        <ChevronLeftIcon />
      </Button>
      <Button
        variant="outline"
        size="icon"
        aria-label="Scroll right"
        onClick={() => scroll(1)}
        className="absolute top-1/2 -right-3 hidden size-8 -translate-y-1/2 rounded-full bg-background/90 shadow-sm backdrop-blur md:inline-flex"
      >
        <ChevronRightIcon />
      </Button>
    </div>
  );
}
