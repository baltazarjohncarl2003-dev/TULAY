"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { MessageSquareIcon } from "lucide-react";
import { fetchChatInbox, fetchUnreadChatCount } from "@/lib/actions/chats";
import {
  appendInbox,
  type ChatList,
  inboxCursor,
  OPEN_CHAT_EVENT,
  type OpenChatDetail,
  refreshInbox,
} from "@/lib/chats";
import { cn } from "@/lib/utils";

// Loaded when the panel first opens, so the chat UI is not part of every page's JavaScript.
const ChatPanel = dynamic(() => import("@/components/chat-panel").then((m) => m.ChatPanel), {
  ssr: false,
  loading: () => <p className="p-4 text-sm text-muted-foreground">Loading chats…</p>,
});

const noop = () => () => {};

/** Messages button with a dropdown panel. Dispatch OPEN_CHAT_EVENT on window to open it (optionally on one supplier). */
export function MessagesMenu({
  href,
  variant,
  triggerClassName,
}: {
  href: string;
  variant: "site" | "workspace";
  triggerClassName: string;
}) {
  const [data, setData] = useState<ChatList | null>(null);
  const [count, setCount] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<OpenChatDetail | null>(null);
  // False on the server and during hydration, so the portal only renders in the browser.
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Keeps the last good list when a refresh fails or returns nothing.
  const refresh = useCallback(
    () =>
      fetchChatInbox()
        .then((next) => {
          if (next) setData((d) => (d ? refreshInbox(d, next) : next));
        })
        .catch(() => {
          // Keep the last good list.
        })
        .finally(() => setLoaded(true)),
    [],
  );

  async function more() {
    const last = data?.chats.at(-1);
    if (!last) return;
    try {
      const page = await fetchChatInbox(inboxCursor(last));
      if (page) setData((d) => (d ? appendInbox(d, page) : d));
    } catch {
      // Keep the list on screen; the button stays so the reader can retry.
    }
  }

  // The header badge while the panel is closed: one small count, not the chats.
  const refreshCount = useCallback(
    () =>
      fetchUnreadChatCount()
        .then((n) => {
          if (n !== null) setCount(n);
        })
        .catch(() => {
          // Keep the last count.
        }),
    [],
  );

  const handled = useCallback(() => setTarget(null), []);

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  // On mount, right after the panel closes, and every 30 seconds while it is closed and the tab is visible.
  useEffect(() => {
    if (open) return;
    void refreshCount();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void refreshCount();
    }, 30_000);
    return () => clearInterval(id);
  }, [open, refreshCount]);

  // The chats load only while the panel is open.
  useEffect(() => {
    if (!open) return;
    void refresh();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 30_000);
    return () => clearInterval(id);
  }, [open, refresh]);

  useEffect(() => {
    function onOpenChat(e: Event) {
      e.preventDefault(); // tells the sender that a signed-in menu is listening
      setOpen(true);
      setTarget((e as CustomEvent<OpenChatDetail>).detail ?? null);
    }
    window.addEventListener(OPEN_CHAT_EVENT, onOpenChat);
    return () => window.removeEventListener(OPEN_CHAT_EVENT, onOpenChat);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    function onPointerDown(e: PointerEvent) {
      const t = e.target;
      // Ignore targets that were removed from the page before this event ran.
      if (!(t instanceof Node) || !t.isConnected) return;
      if (panelRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
      close();
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open, close]);

  useEffect(() => {
    if (!open || !mounted) return;
    // Line the panel up under the icon; the header content is centered on wide screens.
    const icon = triggerRef.current?.getBoundingClientRect();
    if (icon?.width) {
      panelRef.current?.style.setProperty("--menu-top", `${icon.bottom + 12}px`);
      panelRef.current?.style.setProperty("--menu-right", `${Math.max(16, window.innerWidth - icon.right)}px`);
    }
    panelRef.current?.focus();
  }, [open, mounted]);

  const unread = open && data ? data.chats.filter((c) => c.unread).length : count;

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={unread ? `Messages, ${unread} unread` : "Messages"}
        onClick={() => (open ? close() : setOpen(true))}
        className={cn("relative", variant === "site" && "flex flex-col items-center gap-0.5", triggerClassName)}
      >
        <MessageSquareIcon className={variant === "site" ? "size-5" : "size-6"} aria-hidden />
        {variant === "site" && <span>Messages</span>}
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 grid min-w-4 place-items-center rounded-full bg-primary px-1 text-micro leading-4 font-semibold text-primary-foreground">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open &&
        mounted &&
        createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-label="Messages"
            tabIndex={-1}
            className="fixed z-50 inset-0 bg-background flex flex-col md:inset-auto md:top-[var(--menu-top,5rem)] md:right-[var(--menu-right,1rem)] md:h-[min(42rem,calc(100dvh-var(--menu-top,5rem)-1rem))] md:w-[24rem] md:rounded-xl md:border md:shadow-xl overflow-hidden outline-none"
          >
            {data ? (
              <ChatPanel
                data={data}
                refresh={refresh}
                target={target}
                onTargetHandled={handled}
                seeAllHref={href}
                onClose={close}
                onMore={more}
              />
            ) : (
              <p className="p-4 text-sm text-muted-foreground">{loaded ? "Could not load chats." : "Loading chats…"}</p>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
