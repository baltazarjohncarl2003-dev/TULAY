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
import { usePathname } from "next/navigation";
import { Suspense, useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type NavLink = { href: string; label: string };
export type BottomTab = NavLink & { key: "home" | "categories" | "request" | "messages" | "account" };

const TAB_ICONS: Record<BottomTab["key"], LucideIcon> = {
  home: HomeIcon,
  categories: LayoutGridIcon,
  request: FileTextIcon,
  messages: MessageSquareIcon,
  account: UserIcon,
};

/** Longest matching href wins so /buyer/messages doesn't also light up /buyer. Query hrefs never match: usePathname has no query. */
function useActiveItem<T extends NavLink>(items: T[]): T | undefined {
  const pathname = usePathname();
  return items
    .filter(
      (i) =>
        !i.href.includes("?") &&
        (pathname === i.href || (i.href !== "/" && pathname.startsWith(`${i.href}/`))),
    )
    .sort((a, b) => b.href.length - a.href.length)[0];
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
              className="rounded-md px-3 py-2 text-sm font-medium hover:bg-muted"
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <nav aria-label="Account and help" className="flex flex-col gap-1 border-t pt-3">
          {utilityLinks.map((l) => (
            <Link
              key={l.label}
              href={l.href}
              onClick={close}
              className="rounded-md px-3 py-2 text-sm hover:bg-muted"
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
          className="whitespace-nowrap text-sm font-medium hover:text-primary"
        >
          {n.label}
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
              className="flex h-full flex-col items-center justify-center gap-1 text-[10px] leading-none text-muted-foreground hover:text-foreground"
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
