"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { ROLE_NAV } from "@/components/nav";
import { signOut } from "@/app/(auth)/login/actions";
import type { Role } from "@/lib/types";

/** Signed-in layout: top bar + role sidebar (horizontal scroller on mobile). */
export function WorkspaceShell({ role, userName, children }: { role: Role; userName: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const displayName = userName || "My account";
  const nav = ROLE_NAV[role];
  // Longest matching prefix wins so /buyer/rfqs/new doesn't also light up /buyer/rfqs.
  const active = nav
    .filter((n) => pathname === n.href || pathname.startsWith(n.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="flex h-14 items-center gap-3 px-4">
          <Link href="/" className="text-xl font-extrabold tracking-tight text-primary">
            TULAY
          </Link>
          <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-medium capitalize text-accent-foreground">
            {role} hub
          </span>
          <div className="ml-auto flex items-center gap-2">
            {role !== "admin" && (
              <Link href={role === "buyer" ? "/supplier" : "/buyer"} className={buttonVariants({ variant: "ghost", size: "sm" })}>
                {role === "buyer" ? "Switch to selling" : "Switch to buying"}
              </Link>
            )}
            <Link href={`/${role}/account`} className="flex items-center gap-2 text-sm">
              <span className="grid size-8 place-items-center rounded-full bg-primary font-semibold text-primary-foreground">
                {displayName.slice(0, 1).toUpperCase()}
              </span>
              <span className="hidden sm:inline">{displayName}</span>
            </Link>
            <form action={signOut}>
              <button type="submit" className={buttonVariants({ variant: "outline", size: "sm" })}>
                Log out
              </button>
            </form>
          </div>
        </div>
        <nav aria-label="Workspace mobile" className="flex gap-1 overflow-x-auto border-t px-2 py-1 lg:hidden">
          {nav.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-current={active === n.href ? "page" : undefined}
              className={cn(buttonVariants({ variant: active === n.href ? "default" : "ghost", size: "sm" }), "shrink-0")}
            >
              {n.label}
            </Link>
          ))}
        </nav>
      </header>
      <div className="flex flex-1">
        <aside className="hidden w-60 shrink-0 border-r bg-muted/30 p-3 lg:block">
          <nav aria-label="Workspace" className="sticky top-16 flex flex-col gap-1">
            {nav.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active === n.href ? "page" : undefined}
                className={cn(
                  "rounded-md px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground",
                  active === n.href && "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
                )}
              >
                {n.label}
              </Link>
            ))}
          </nav>
        </aside>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:py-8">
          <p className="mb-4 rounded-md border border-dashed border-primary/40 bg-accent/50 px-3 py-2 text-xs text-accent-foreground">
            Sign-in, accounts, supplier verification and admin settings are live. Other screens still show sample data.
          </p>
          {children}
        </main>
      </div>
    </div>
  );
}
