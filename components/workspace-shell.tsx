import Link from "next/link";
import { BellIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { ROLE_NAV } from "@/components/nav";
import { WorkspaceNav } from "@/components/workspace-nav";
import { signOut } from "@/app/(auth)/login/actions";
import { canAdmin, getSessionUser } from "@/lib/auth";
import { countUnreadNotifications } from "@/lib/data/notifications";
import type { Role } from "@/lib/types";

/** Signed-in layout: top bar + role sidebar (horizontal scroller on mobile). Server-rendered; refreshes with router.refresh(). */
export async function WorkspaceShell({ role, userName, children }: { role: Role; userName: string; children: React.ReactNode }) {
  const [user, unread] = await Promise.all([
    getSessionUser(),
    countUnreadNotifications().catch(() => 0), // a failed count must not take down every workspace page
  ]);
  const displayName = userName || "My account";
  // Hide admin pages the admin's sub-roles cannot use; the database still enforces them.
  const nav = ROLE_NAV[role].filter((n) => !n.roles || (user !== null && canAdmin(user, ...n.roles)));

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
            <Link
              href={`/${role}/notifications`}
              aria-label={`Notifications, ${unread} unread`}
              className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "relative")}
            >
              <BellIcon aria-hidden />
              {unread > 0 && (
                <span className="absolute -top-0.5 -right-0.5 grid min-w-4 place-items-center rounded-full bg-destructive px-1 text-micro leading-4 font-semibold text-white">
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </Link>
            <Link href={`/${role}/account`} className="flex items-center gap-2 text-sm">
              <span className="grid size-8 place-items-center rounded-full bg-primary font-semibold text-primary-foreground">
                {displayName.slice(0, 1).toUpperCase()}
              </span>
              <span className="hidden sm:inline">{displayName}</span>
            </Link>
            <form action={signOut}>
              <button type="submit" className={buttonVariants({ variant: "outline", size: "sm" })}>
                Log Out
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
