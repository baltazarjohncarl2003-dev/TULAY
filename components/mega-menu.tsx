"use client";

import { MenuIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { CategoryIcon } from "@/components/category-icon";
import { CATEGORIES } from "@/lib/categories";
import type { Category } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Place inside a `relative` max-w container: the panel spans that container. Pass only live categories from the server. */
export function MegaMenu({ categories = CATEGORIES }: { categories?: Category[] }) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const tops = categories.filter((c) => c.parentSlug === null);
  const [activeSlug, setActiveSlug] = useState(tops[0]?.slug ?? "");
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

  const active = tops.find((c) => c.slug === activeSlug) ?? tops[0];
  const children = active ? categories.filter((c) => c.parentSlug === active.slug) : [];
  const close = () => setOpen(false);

  return (
    <div ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 whitespace-nowrap text-sm font-medium hover:text-primary"
      >
        <MenuIcon className="size-4" aria-hidden="true" />
        All Categories
      </button>
      <div
        id={panelId}
        hidden={!open}
        className="absolute left-0 right-0 top-full z-50 max-h-[70vh] overflow-y-auto rounded-b-lg border bg-card shadow-lg"
      >
        {open && !active && (
          <div className="flex flex-col gap-4 p-5">
            <p className="text-sm text-muted-foreground">Categories appear here as suppliers list products.</p>
            <Link href="/categories" onClick={close} className="w-fit whitespace-nowrap text-sm font-medium hover:text-primary">
              Browse All Categories
            </Link>
          </div>
        )}
        {open && active && (
          <div className="grid grid-cols-[16rem_1fr]">
            <ul className="border-r py-2">
              {tops.map((c) => (
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
              <h2 className="text-card-title">{active.name}</h2>
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
                  View All in {active.name}
                </Link>
                <Link href="/categories" onClick={close} className="whitespace-nowrap hover:text-primary">
                  Browse All Categories
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
