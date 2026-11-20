"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BellIcon, FileTextIcon, PackageIcon, ShieldAlertIcon, type LucideIcon } from "lucide-react";
import { EmptyState } from "@/components/common";
import { markNotificationsRead } from "@/lib/actions/deals";
import { dateTime } from "@/lib/format";
import type { Notification } from "@/lib/data/notifications";
import { cn } from "@/lib/utils";

const isSitePath = (link: string) => link.startsWith("/") && !link.startsWith("//");

export type NotificationCategory = "orders" | "deals" | "claims" | "system";

/** Groups a notification by the page it links to. Query and hash are ignored. */
export function notificationCategory(link: string): NotificationCategory {
  const path = link.split(/[?#]/)[0];
  if (path.includes("/orders") || path.includes("/payouts")) return "orders";
  if (/\/(rfqs|quotes|invites|requests)/.test(path)) return "deals";
  if (path.includes("/claims")) return "claims";
  return "system";
}

const TABS: { id: "all" | NotificationCategory; label: string }[] = [
  { id: "all", label: "All" },
  { id: "orders", label: "Orders" },
  { id: "deals", label: "Quotes & Requests" },
  { id: "claims", label: "Claims" },
  { id: "system", label: "System" },
];

const ICONS: Record<NotificationCategory, LucideIcon> = {
  orders: PackageIcon,
  deals: FileTextIcon,
  claims: ShieldAlertIcon,
  system: BellIcon,
};

const EMPTY: Record<"all" | NotificationCategory, string> = {
  all: "No notifications yet",
  orders: "No order updates",
  deals: "No quote or request updates",
  claims: "No claim updates",
  system: "No system notices",
};

/** Notifications grouped into category tabs. Viewing it marks everything read once, then refreshes the header count. */
export function NotificationsList({ notifications }: { notifications: Notification[] }) {
  const router = useRouter();
  // Remember what was unread on arrival so the "New" marks survive the refresh after marking read.
  const [unread] = useState(() => new Set(notifications.filter((n) => !n.readAt).map((n) => n.id)));
  const [tab, setTab] = useState<"all" | NotificationCategory>("all");

  useEffect(() => {
    if (unread.size === 0) return;
    markNotificationsRead().then((res) => {
      if (res.ok) router.refresh();
      else toast.error(res.error);
    });
  }, [unread, router]);

  const categoryOf = (n: Notification) => notificationCategory(n.link);
  const visible = tab === "all" ? notifications : notifications.filter((n) => categoryOf(n) === tab);

  return (
    <div className="flex flex-col gap-4">
      {/* Filter buttons (aria-pressed), not an ARIA tab widget: no arrow-key or tabpanel contract to keep. */}
      <div role="group" aria-label="Filter notifications" className="flex gap-1 overflow-x-auto border-b">
        {TABS.map((t) => {
          const count = t.id === "all" ? notifications.length : notifications.filter((n) => categoryOf(n) === t.id).length;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              aria-pressed={active}
              onClick={() => setTab(t.id)}
              className={cn(
                "-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap",
                active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label} ({count})
            </button>
          );
        })}
      </div>

      {visible.length === 0 ? (
        <EmptyState title={EMPTY[tab]}>{tab === "all" && "Updates on your orders, quotes and claims show up here."}</EmptyState>
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border">
          {visible.map((n) => {
            const Icon = ICONS[categoryOf(n)];
            const isUnread = unread.has(n.id);
            const content = (
              <>
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-primary">
                  <Icon className="size-5" aria-hidden />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex items-start justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2 font-semibold break-words">
                      {isUnread && (
                        <span aria-hidden className="size-2 shrink-0 rounded-full bg-primary" />
                      )}
                      {isUnread && <span className="sr-only">Unread: </span>}
                      {n.title}
                    </span>
                    <time dateTime={n.createdAt} className="shrink-0 text-xs text-muted-foreground">
                      {dateTime(n.createdAt)}
                    </time>
                  </span>
                  {n.body && <span className="line-clamp-2 text-sm break-words text-muted-foreground">{n.body}</span>}
                </span>
              </>
            );
            const rowClass = "flex gap-3 px-4 py-3 hover:bg-muted/50";
            return (
              <li key={n.id} className={cn(isUnread && "bg-accent/40")}>
                {isSitePath(n.link) ? (
                  <Link href={n.link} className={rowClass}>
                    {content}
                  </Link>
                ) : (
                  <div className={rowClass}>{content}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
