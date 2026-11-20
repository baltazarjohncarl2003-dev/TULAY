import Link from "next/link";
import { ArrowLeftIcon, ArrowLeftRightIcon, BellIcon, LogOutIcon, MessageSquareIcon, ShoppingCartIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { ROLE_NAV } from "@/components/nav";
import { WorkspaceNav } from "@/components/workspace-nav";
import { signOut } from "@/app/(auth)/login/actions";
import { canAdmin, getSessionUser } from "@/lib/auth";
import { myAvatarUrl } from "@/lib/data/account";
import { countUnreadNotifications } from "@/lib/data/notifications";
import { getCart } from "@/lib/data/orders";
import { mySellerName } from "@/lib/data/supplier";
import type { Role } from "@/lib/types";

const ICON_LINK = cn(buttonVariants({ variant: "ghost", size: "icon" }), "relative [&_svg:not([class*='size-'])]:size-6");

/** Signed-in layout: top bar + role sidebar (horizontal scroller on mobile). Server-rendered; refreshes with router.refresh(). */
export async function WorkspaceShell({ role, userName, children }: { role: Role; userName: string; children: React.ReactNode }) {
  // Failed counts or names must not take down every workspace page.
  const [user, unread, cartLines, sellerName, avatar] = await Promise.all([
    getSessionUser(),
    countUnreadNotifications().catch(() => 0),
    role === "admin" ? Promise.resolve(0) : getCart().then((c) => c.length).catch(() => 0),
    role === "supplier" ? mySellerName().catch(() => null) : Promise.resolve(null),
    myAvatarUrl().catch(() => null),
  ]);
  // Selling mode speaks as the business, not the person.
  const displayName = sellerName || userName || "My account";
  // Hide admin pages the admin's sub-roles cannot use; the database still enforces them.
  const nav = ROLE_NAV[role].filter((n) => !n.roles || (user !== null && canAdmin(user, ...n.roles)));
  const showMessages = role !== "admin" || (user !== null && canAdmin(user, "support"));

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="flex h-14 items-center gap-2 px-4 sm:gap-3">
          <Link href="/" className="text-xl font-extrabold tracking-tight text-primary">
            TULAY
          </Link>
          <Link
            href="/marketplace"
            className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ArrowLeftIcon aria-hidden="true" className="size-4" />
            <span className="sr-only md:not-sr-only">Back to Marketplace</span>
          </Link>
          <span className="hidden rounded-full bg-accent px-2 py-0.5 text-xs font-medium capitalize text-accent-foreground sm:inline">
            {role} hub
          </span>
          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            {/* Below sm, Switch and Log Out go icon-only (labels stay for screen readers) so the bar fits a 375 px phone. */}
            {role !== "admin" && (
              // Red pill to start selling, green pill to go back to buying (owner's spec).
              <Link
                href={role === "buyer" ? "/supplier" : "/buyer"}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-full border-2 bg-white px-2 text-sm font-semibold whitespace-nowrap transition-colors sm:px-3",
                  role === "buyer"
                    ? "border-primary text-primary hover:bg-primary/10"
                    : "border-success text-success hover:bg-success/10",
                )}
              >
                <ArrowLeftRightIcon aria-hidden="true" className="size-4 sm:hidden" />
                <span className="sr-only sm:not-sr-only">{role === "buyer" ? "Switch to Selling" : "Switch to Buying"}</span>
              </Link>
            )}
            {role !== "admin" && (
              <Link
                href="/buyer/cart"
                aria-label={cartLines > 0 ? `Cart, ${cartLines} ${cartLines === 1 ? "line" : "lines"}` : "Cart"}
                className={ICON_LINK}
              >
                <ShoppingCartIcon aria-hidden />
                {cartLines > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 grid min-w-4 place-items-center rounded-full bg-primary px-1 text-micro leading-4 font-semibold text-primary-foreground">
                    {cartLines > 99 ? "99+" : cartLines}
                  </span>
                )}
              </Link>
            )}
            {showMessages && (
              <Link href={`/${role}/messages`} aria-label="Messages" className={ICON_LINK}>
                <MessageSquareIcon aria-hidden />
              </Link>
            )}
            <Link href={`/${role}/notifications`} aria-label={`Notifications, ${unread} unread`} className={ICON_LINK}>
              <BellIcon aria-hidden />
              {unread > 0 && (
                <span aria-hidden className="absolute top-1.5 right-1.5 size-2.5 rounded-full bg-destructive ring-2 ring-background" />
              )}
            </Link>
            <Link href={`/${role}/account`} aria-label={`My account: ${displayName}`} className="flex items-center gap-2 text-sm">
              {avatar ? (
                // eslint-disable-next-line @next/next/no-img-element -- small public storage image, no optimizer needed
                <img src={avatar} alt="" className="size-8 rounded-full object-cover" />
              ) : (
                <span className="grid size-8 place-items-center rounded-full bg-primary font-semibold text-primary-foreground">
                  {displayName.slice(0, 1).toUpperCase()}
                </span>
              )}
              <span className="hidden max-w-48 truncate lg:inline">{displayName}</span>
            </Link>
            <form action={signOut}>
              <button type="submit" className={buttonVariants({ variant: "outline", size: "sm" })}>
                <LogOutIcon aria-hidden="true" className="sm:hidden" />
                <span className="sr-only sm:not-sr-only">Log Out</span>
              </button>
            </form>
          </div>
        </div>
        <WorkspaceNav nav={nav} variant="mobile" />
      </header>
      <div className="flex flex-1">
        <aside className="hidden w-60 shrink-0 border-r bg-muted/30 p-3 lg:block">
          <WorkspaceNav nav={nav} variant="sidebar" />
        </aside>
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
