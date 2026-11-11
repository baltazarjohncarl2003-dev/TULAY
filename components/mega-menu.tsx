"use client";

import { MenuIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { CategoryIcon } from "@/components/category-icon";
import { CATEGORIES, LAUNCH_CATEGORIES } from "@/lib/categories";
import { cn } from "@/lib/utils";

/** Place inside a `relative` max-w container: the panel spans that container. */
export function MegaMenu() {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [activeSlug, setActiveSlug] = useState(LAUNCH_CATEGORIES[0]?.slug ?? "");
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const active = LAUNCH_CATEGORIES.find((c) => c.slug === activeSlug) ?? LAUNCH_CATEGORIES[0];
  const children = active ? CATEGORIES.filter((c) => c.parentSlug === active.slug) : [];
  const close = () => setOpen(false);

  return (
    <div ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 whitespace-nowrap text-sm font-semibold hover:text-primary"
      >
        <MenuIcon className="size-4" aria-hidden="true" />
        All categories
      </button>
      <div
        id={panelId}
        hidden={!open}
        className="absolute left-0 right-0 top-full z-50 max-h-[70vh] overflow-y-auto rounded-b-lg border bg-card shadow-lg"
      >
        {open && active && (
          <div className="grid grid-cols-[16rem_1fr]">
            <ul className="border-r py-2">
              {LAUNCH_CATEGORIES.map((c) => (
                <li key={c.slug}>
                  <Link
                    href={`/marketplace?category=${c.slug}`}
                    onClick={close}
                    onMouseEnter={() => setActiveSlug(c.slug)}
                    onFocus={() => setActiveSlug(c.slug)}
                    className={cn(
                      "flex items-center gap-2 whitespace-nowrap px-4 py-2 text-sm",
                      c.slug === active.slug ? "bg-accent font-medium text-primary" : "hover:bg-muted",
                    )}
                  >
                    <CategoryIcon slug={c.slug} className="size-4" />
                    {c.name}
                  </Link>
                </li>
              ))}
            </ul>
            <div className="flex flex-col gap-4 p-5">
              <h2 className="text-base font-semibold">{active.name}</h2>
              <ul className="grid grid-cols-3 gap-x-6 gap-y-2 text-sm">
                {children.map((c) => (
                  <li key={c.slug}>
                    <Link
                      href={`/marketplace?category=${c.slug}`}
                      onClick={close}
                      className="text-muted-foreground hover:text-primary"
                    >
                      {c.name}
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="flex gap-5 text-sm font-medium">
                <Link
                  href={`/marketplace?category=${active.slug}`}
                  onClick={close}
                  className="whitespace-nowrap text-primary hover:underline"
                >
                  View all in {active.name}
                </Link>
                <Link href="/categories" onClick={close} className="whitespace-nowrap hover:text-primary">
                  Browse all categories
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
