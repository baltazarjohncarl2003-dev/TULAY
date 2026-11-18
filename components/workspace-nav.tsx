"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import type { NavItem } from "@/components/nav";

/** Workspace links with the current page highlighted: a horizontal scroller on mobile, a sidebar on desktop. */
export function WorkspaceNav({ nav, variant }: { nav: NavItem[]; variant: "mobile" | "sidebar" }) {
  const pathname = usePathname();
  // Longest matching prefix wins so /buyer/rfqs/new doesn't also light up /buyer/rfqs.
  const active = nav
    .filter((n) => pathname === n.href || pathname.startsWith(n.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  if (variant === "mobile")
    return (
      <nav aria-label="Workspace mobile" className="flex gap-1 overflow-x-auto border-t px-2 py-1 lg:hidden">
        {nav.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            target={n.newTab ? "_blank" : undefined}
            rel={n.newTab ? "noopener" : undefined}
            aria-current={active === n.href ? "page" : undefined}
            className={cn(buttonVariants({ variant: active === n.href ? "default" : "ghost", size: "sm" }), "shrink-0")}
          >
            {n.label}
            {n.newTab && <span className="sr-only"> (opens in a new tab)</span>}
          </Link>
        ))}
      </nav>
    );

  return (
    <nav aria-label="Workspace" className="sticky top-16 flex flex-col gap-1">
      {nav.map((n) => (
        <Link
          key={n.href}
          href={n.href}
          target={n.newTab ? "_blank" : undefined}
          rel={n.newTab ? "noopener" : undefined}
          aria-current={active === n.href ? "page" : undefined}
          className={cn(
            "rounded-md px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground",
            active === n.href && "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
          )}
        >
          {n.label}
          {n.newTab && <span className="sr-only"> (opens in a new tab)</span>}
        </Link>
      ))}
    </nav>
  );
}
