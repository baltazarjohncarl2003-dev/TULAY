"use client";

import {
  FileTextIcon,
  HomeIcon,
  LayoutGridIcon,
  MenuIcon,
  MessageSquareIcon,
  UserIcon,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { OPEN_CHAT_EVENT } from "@/lib/chats";
import { cn } from "@/lib/utils";

export type NavLink = { href: string; label: string; emphasis?: boolean };

/** Emphasised links (AI Mode) get a sparkle in front; it is decorative, the label stays the accessible name. */
function NavLabel({ item }: { item: NavLink }) {
  return item.emphasis ? (
    <>
      <span aria-hidden="true">✨ </span>
      {item.label}
    </>
  ) : (
    item.label
  );
}
export type BottomTab = NavLink & { key: "home" | "categories" | "request" | "messages" | "account" };

const TAB_ICONS: Record<BottomTab["key"], LucideIcon> = {
  home: HomeIcon,
  categories: LayoutGridIcon,
  request: FileTextIcon,
  messages: MessageSquareIcon,
  account: UserIcon,
};

/** The nav item for the current URL. Longest path match wins; among items on the same path, one whose query
 *  params all match the URL beats one with no query. A query item never matches when its params are absent. */
export function activeItem<T extends NavLink>(items: T[], pathname: string, search: URLSearchParams): T | undefined {
  let best: T | undefined;
  let bestPath = -1;
  let bestQuery = -1;
  for (const item of items) {
    const url = new URL(item.href, "http://x");
    const path = url.pathname;
    const params = [...url.searchParams];
    const pathMatch = pathname === path || (path !== "/" && pathname.startsWith(`${path}/`));
    if (!pathMatch || !params.every(([k, v]) => search.get(k) === v)) continue;
    if (path.length > bestPath || (path.length === bestPath && params.length > bestQuery)) {
      best = item;
      bestPath = path.length;
      bestQuery = params.length;
    }
  }
  return best;
}

/** Only call inside Suspense: useSearchParams is request-time data under cacheComponents. */
function useActiveItem<T extends NavLink>(items: T[]): T | undefined {
  return activeItem(items, usePathname(), useSearchParams());
}

/** Phone-only menu (below md): every public nav item plus the utility links. */
export function MobileMenu({ navItems, utilityLinks }: { navItems: NavLink[]; utilityLinks: NavLink[] }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        aria-label="Open menu"
        className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "md:hidden")}
      >
        <MenuIcon aria-hidden="true" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Menu</DialogTitle>
        </DialogHeader>
        <nav aria-label="Site menu" className="flex flex-col gap-1">
          {navItems.map((n) => (
            <Link
              key={n.label}
              href={n.href}
              onClick={close}
              className={cn("rounded-md px-3 py-2 text-sm font-medium hover:bg-muted", n.emphasis && "text-base font-bold")}
            >
              <NavLabel item={n} />
            </Link>
          ))}
        </nav>
        <nav aria-label="Account and help" className="flex flex-col gap-1 border-t pt-3">
          {utilityLinks.map((l) => (
            <Link
              key={l.label}
              href={l.href}
              onClick={close}
              className="rounded-md px-3 py-2 text-sm font-medium hover:bg-muted"
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </DialogContent>
    </Dialog>
  );
}

// usePathname is request-time data under cacheComponents, so the static shell renders links unmarked
// and the aria-current marker fills in inside Suspense.

/** Desktop main nav links (rendered inside the Main nav element). */
export function MainNavLinks({ items }: { items: NavLink[] }) {
  return (
    <Suspense fallback={<MainNavList items={items} />}>
      <ActiveMainNav items={items} />
    </Suspense>
  );
}

function ActiveMainNav({ items }: { items: NavLink[] }) {
  return <MainNavList items={items} active={useActiveItem(items)} />;
}

function MainNavList({ items, active }: { items: NavLink[]; active?: NavLink }) {
  return (
    <>
      {items.map((n) => (
        <Link
          key={n.label}
          href={n.href}
          aria-current={active === n ? "page" : undefined}
          className={cn(
            "whitespace-nowrap text-sm font-medium hover:text-primary aria-[current=page]:font-semibold aria-[current=page]:text-primary",
            n.emphasis && "text-base font-bold aria-[current=page]:font-bold",
          )}
        >
          <NavLabel item={n} />
        </Link>
      ))}
    </>
  );
}

/** Phone bottom tab bar (below md). Icons are picked here by key, not passed as props. */
export function BottomNavLinks({ items }: { items: BottomTab[] }) {
  return (
    <Suspense fallback={<BottomNavList items={items} />}>
      <ActiveBottomNav items={items} />
    </Suspense>
  );
}

function ActiveBottomNav({ items }: { items: BottomTab[] }) {
  return <BottomNavList items={items} active={useActiveItem(items)} />;
}

function BottomNavList({ items, active }: { items: BottomTab[]; active?: BottomTab }) {
  return (
    <ul className="grid h-full grid-cols-5">
      {items.map((t) => {
        const Icon = TAB_ICONS[t.key];
        return (
          <li key={t.key}>
            <Link
              href={t.href}
              aria-current={active === t ? "page" : undefined}
              onClick={(e) => {
                // A signed-in messages menu answers by cancelling the event; otherwise follow the link.
                if (t.key === "messages" && !window.dispatchEvent(new CustomEvent(OPEN_CHAT_EVENT, { cancelable: true }))) {
                  e.preventDefault();
                }
              }}
              className="flex h-full flex-col items-center justify-center gap-1 text-micro leading-none text-muted-foreground hover:text-foreground aria-[current=page]:font-semibold aria-[current=page]:text-primary"
            >
              <Icon className="size-5" aria-hidden="true" />
              <span className="whitespace-nowrap">{t.label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
