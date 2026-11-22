"use client";

import Link from "next/link";
import { type JSX, type ReactNode, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { PanelLeftIcon, SquarePenIcon, Trash2Icon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type AiChatItem = { id: string; title: string; updatedAt: string }; // updatedAt is an ISO timestamp

const GROUP_LABELS = ["Today", "Yesterday", "Previous 7 days", "Previous 30 days", "Older"];
const DAY_MS = 24 * 60 * 60 * 1000;
const subscribeNoop = () => () => {};

// Calendar day in Manila as a UTC midnight timestamp, so day differences are exact multiples of DAY_MS.
function manilaDay(date: Date): number {
  const [year, month, day] = date
    .toLocaleDateString("en-CA", { timeZone: "Asia/Manila" })
    .split("-")
    .map(Number);
  return Date.UTC(year, month - 1, day);
}

/** Groups chats by Manila calendar day relative to `now`. Empty groups are omitted; input order is kept. */
export function groupChats(chats: AiChatItem[], now: Date): { label: string; chats: AiChatItem[] }[] {
  const today = manilaDay(now);
  const buckets: AiChatItem[][] = GROUP_LABELS.map(() => []);
  for (const chat of chats) {
    const days = Math.round((today - manilaDay(new Date(chat.updatedAt))) / DAY_MS);
    // Future or same-day timestamps count as Today. Invalid timestamps give NaN and fall through to Older.
    const index = days <= 0 ? 0 : days === 1 ? 1 : days <= 7 ? 2 : days <= 30 ? 3 : 4;
    buckets[index].push(chat);
  }
  return GROUP_LABELS.map((label, index) => ({ label, chats: buckets[index] })).filter(
    (group) => group.chats.length > 0,
  );
}

type SidebarBodyProps = {
  chats: AiChatItem[] | null | undefined;
  activeId: string | null;
  onNew: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => Promise<boolean>;
};

function ChatRow({
  chat,
  active,
  onSelect,
  onDelete,
}: {
  chat: AiChatItem;
  active: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => Promise<boolean>;
}) {
  const [phase, setPhase] = useState<"idle" | "confirm" | "deleting">("idle");

  async function confirmDelete() {
    setPhase("deleting");
    let ok: boolean;
    try {
      ok = await onDelete(chat.id);
    } catch {
      ok = false;
    }
    if (!ok) toast.error("Could not delete this chat. Try again.");
    setPhase("idle");
  }

  if (phase !== "idle") {
    return (
      <li className="flex flex-wrap items-center gap-2 rounded-lg px-2 py-2 text-sm">
        <span>Delete this chat?</span>
        <button
          type="button"
          disabled={phase === "deleting"}
          onClick={confirmDelete}
          className="font-medium text-destructive disabled:opacity-50"
        >
          Delete
        </button>
        <button
          type="button"
          disabled={phase === "deleting"}
          onClick={() => setPhase("idle")}
          className="text-muted-foreground disabled:opacity-50"
        >
          Cancel
        </button>
      </li>
    );
  }

  return (
    <li
      className={cn(
        "group flex items-center rounded-lg",
        active ? "bg-primary/10 font-medium text-primary" : "hover:bg-muted",
      )}
    >
      <button
        type="button"
        title={chat.title}
        aria-current={active ? "page" : undefined}
        onClick={() => onSelect(chat.id)}
        className="min-w-0 flex-1 truncate px-2 py-2 text-left text-sm"
      >
        {chat.title}
      </button>
      <button
        type="button"
        aria-label={`Delete chat: ${chat.title}`}
        onClick={() => setPhase("confirm")}
        className={cn(
          buttonVariants({ variant: "ghost", size: "icon-sm" }),
          "mr-1 text-muted-foreground hover:text-destructive md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100",
        )}
      >
        <Trash2Icon />
      </button>
    </li>
  );
}

function SidebarBody({ chats, activeId, onNew, onSelect, onDelete }: SidebarBodyProps): JSX.Element {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const groups = useMemo(() => {
    if (!chats || chats.length === 0) return [];
    const matches = chats.filter((chat) => chat.title.toLowerCase().includes(needle));
    return groupChats(matches, new Date());
  }, [chats, needle]);

  let content: ReactNode;
  if (chats === undefined) {
    content = <p className="px-2 text-sm text-muted-foreground">Loading chats…</p>;
  } else if (chats === null) {
    content = (
      <div className="space-y-2 px-2 text-sm text-muted-foreground">
        <p>Sign in to save your chats and find them here.</p>
        <Link href="/login?next=%2Fsearch" className="font-medium text-primary underline-offset-4 hover:underline">
          Sign in
        </Link>
      </div>
    );
  } else if (chats.length === 0) {
    content = <p className="px-2 text-sm text-muted-foreground">No chats yet. Your conversations will appear here.</p>;
  } else {
    content = (
      <>
        <Input
          type="search"
          aria-label="Search chats"
          placeholder="Search chats"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {groups.length === 0 ? (
          <p className="px-2 text-sm text-muted-foreground">No chats match.</p>
        ) : (
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
            {groups.map((group) => (
              <div key={group.label}>
                <h3 className="px-2 pb-1 text-meta text-muted-foreground">{group.label}</h3>
                <ul className="flex flex-col gap-0.5">
                  {group.chats.map((chat) => (
                    <ChatRow
                      key={chat.id}
                      chat={chat}
                      active={chat.id === activeId}
                      onSelect={onSelect}
                      onDelete={onDelete}
                    />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
      <button
        type="button"
        onClick={onNew}
        className={cn(buttonVariants({ variant: "outline" }), "w-full justify-start")}
      >
        <SquarePenIcon />
        New chat
      </button>
      {content}
    </div>
  );
}

export function AiChatSidebar({
  chats,
  activeId,
  onNew,
  onSelect,
  onDelete,
}: {
  chats: AiChatItem[] | null | undefined; // undefined = loading, null = signed-out visitor
  activeId: string | null;
  onNew: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => Promise<boolean>; // resolves false when the delete failed
}): JSX.Element {
  const [drawerOpen, setDrawerOpen] = useState(false);
  // False on the server and during hydration, so the portal only renders in the browser.
  const mounted = useSyncExternalStore(subscribeNoop, () => true, () => false);
  const openerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
    openerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (drawerOpen) closeRef.current?.focus();
  }, [drawerOpen]);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeDrawer();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawerOpen, closeDrawer]);

  const drawerNew = () => {
    closeDrawer();
    onNew();
  };
  const drawerSelect = (id: string) => {
    closeDrawer();
    onSelect(id);
  };

  return (
    <>
      <aside
        aria-label="Chat history"
        className="hidden md:flex w-72 shrink-0 flex-col border-r bg-muted/30 sticky top-32 h-[calc(100dvh-8rem)]"
      >
        <SidebarBody
          chats={chats}
          activeId={activeId}
          onNew={onNew}
          onSelect={onSelect}
          onDelete={onDelete}
        />
      </aside>

      <button
        ref={openerRef}
        type="button"
        aria-label="Open chat history"
        aria-expanded={drawerOpen}
        onClick={() => setDrawerOpen(true)}
        className={cn(
          buttonVariants({ variant: "outline", size: "icon" }),
          "fixed left-3 top-[7.75rem] z-30 md:hidden bg-background shadow-sm",
        )}
      >
        <PanelLeftIcon />
      </button>

      {mounted && drawerOpen
        ? createPortal(
            <>
              <div className="fixed inset-0 z-50 bg-black/40" onPointerDown={closeDrawer} />
              <div
                role="dialog"
                aria-modal="true"
                aria-label="Chat history"
                className="fixed inset-y-0 left-0 z-50 flex w-[85vw] max-w-80 flex-col bg-background shadow-xl"
              >
                <div className="flex justify-end p-2">
                  <button
                    ref={closeRef}
                    type="button"
                    aria-label="Close chat history"
                    onClick={closeDrawer}
                    className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
                  >
                    <XIcon />
                  </button>
                </div>
                <SidebarBody
                  chats={chats}
                  activeId={activeId}
                  onNew={drawerNew}
                  onSelect={drawerSelect}
                  onDelete={onDelete}
                />
              </div>
            </>,
            document.body,
          )
        : null}
    </>
  );
}
