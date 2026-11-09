"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { PROMOTIONS } from "@/lib/demo/data";
import type { PromotionTheme } from "@/lib/demo/types";
import { cn } from "@/lib/utils";

const SLIDES = PROMOTIONS.filter((p) => p.status === "active").sort((a, b) => a.sortOrder - b.sortOrder);

const THEME: Record<PromotionTheme, { slide: string; cta: string }> = {
  red: { slide: "bg-red-600 text-white", cta: "bg-white text-slate-900 hover:bg-white/90" },
  rose: { slide: "bg-rose-100 text-rose-950", cta: "bg-slate-900 text-white hover:bg-slate-800" },
  amber: { slide: "bg-amber-100 text-amber-950", cta: "bg-slate-900 text-white hover:bg-slate-800" },
  slate: { slide: "bg-slate-800 text-white", cta: "bg-white text-slate-900 hover:bg-white/90" },
};

export function HomeCarousel() {
  const [index, setIndex] = useState(0);
  const total = SLIDES.length;
  if (total === 0) return null;

  const slide = SLIDES[index];
  const go = (step: number) => setIndex((i) => (i + step + total) % total);

  return (
    <section aria-label="Featured promotions" className={cn("rounded-2xl p-6 sm:p-10", THEME[slide.theme].slide)}>
      <div className="flex max-w-2xl flex-col gap-3">
        <span className="text-xs font-semibold tracking-wide uppercase opacity-80">{slide.eyebrow}</span>
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{slide.headline}</h2>
        <p className="text-sm opacity-90 sm:text-base">{slide.subheading}</p>
        <Link
          href={slide.categorySlug ? `/marketplace?category=${slide.categorySlug}` : "/marketplace"}
          className={cn(buttonVariants({ size: "lg" }), "w-fit", THEME[slide.theme].cta)}
        >
          {slide.ctaLabel}
        </Link>
      </div>
      <div className="mt-6 flex items-center justify-end gap-3">
        <Button variant="outline" size="icon" aria-label="Previous promotion" onClick={() => go(-1)}>
          <ChevronLeftIcon />
        </Button>
        <span aria-live="polite" className="min-w-12 text-center text-sm font-medium tabular-nums">
          {index + 1} / {total}
        </span>
        <Button variant="outline" size="icon" aria-label="Next promotion" onClick={() => go(1)}>
          <ChevronRightIcon />
        </Button>
      </div>
    </section>
  );
}
