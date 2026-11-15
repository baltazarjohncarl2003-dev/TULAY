"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/common";
import { markNotificationsRead } from "@/lib/actions/deals";
import { dateTime } from "@/lib/format";
import type { Notification } from "@/lib/data/notifications";

const isSitePath = (link: string) => link.startsWith("/") && !link.startsWith("//");

/** Newest-first notification list. Viewing it marks everything read once, then refreshes the header count. */
export function NotificationsList({ notifications }: { notifications: Notification[] }) {
  const router = useRouter();
  // Remember what was unread on arrival so the "New" marks survive the refresh after marking read.
  const [unread] = useState(() => new Set(notifications.filter((n) => !n.readAt).map((n) => n.id)));

  useEffect(() => {
    if (unread.size === 0) return;
    markNotificationsRead().then((res) => {
      if (res.ok) router.refresh();
      else toast.error(res.error);
    });
  }, [unread, router]);

  if (notifications.length === 0) return <EmptyState title="No notifications yet">Updates on your orders, quotes and claims show up here.</EmptyState>;

  return (
    <ul className="flex flex-col divide-y rounded-lg border">
      {notifications.map((n) => (
        <li key={n.id} className="flex flex-col gap-1 px-4 py-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="font-medium">
              {unread.has(n.id) && <span className="mr-2 rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">New</span>}
              {isSitePath(n.link) ? (
                <Link href={n.link} className="underline-offset-4 hover:underline">
                  {n.title}
                </Link>
              ) : (
                n.title
              )}
            </span>
            <time dateTime={n.createdAt} className="text-xs text-muted-foreground">
              {dateTime(n.createdAt)}
            </time>
          </div>
          {n.body && <p className="text-sm break-words text-muted-foreground">{n.body}</p>}
        </li>
      ))}
    </ul>
  );
}
