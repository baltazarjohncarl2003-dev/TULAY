"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeftIcon, SendIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { Notice } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { fetchChats, markChatRead, sendDirectMessage } from "@/lib/actions/chats";
import { sendRfqMessage } from "@/lib/actions/deals";
import { type Chat, type ChatList, type OpenChatDetail, filterChats } from "@/lib/chats";
import { date } from "@/lib/format";
import { messageSchema } from "@/lib/validation/forms";
import { cn } from "@/lib/utils";

const NETWORK_ERROR = "Could not reach the server. Check your connection and try again.";

// Same Philippine time zone as lib/format.ts, so bubble times agree with the day separators.
const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-GB", { timeZone: "Asia/Manila", hour: "2-digit", minute: "2-digit" });

/** now, 5m, 3h, 2d; a week or older shows the date. */
function ago(iso: string): string {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return "now";
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return d < 7 ? `${d}d` : date(iso);
}

function Avatar({ name, className }: { name: string; className: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-accent font-semibold text-accent-foreground",
        className,
      )}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

function Pill({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "rounded-full px-3 py-1 text-sm",
        pressed ? "bg-accent font-semibold text-primary" : "text-muted-foreground hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

/** Local draft chat for a supplier with no conversation yet. It is saved on the first message. */
function draftFor(supplierId: string, name: string): Chat {
  return {
    id: `draft:${supplierId}`,
    kind: "direct",
    side: "buyer",
    name,
    subtitle: "",
    conversationId: null,
    rfqId: null,
    supplierId,
    href: `/suppliers/${supplierId}`,
    closed: false,
    unread: false,
    lastAt: null,
    messages: [],
  };
}

type SendResult = { ok: true; conversationId?: string } | { ok: false; error: string };

// RFQ chats carry an rfqId and direct chats never do, so that field picks the action.
function deliver(chat: Chat, body: string, idempotencyKey: string): Promise<SendResult> {
  return chat.rfqId !== null
    ? sendRfqMessage(chat.rfqId, chat.supplierId, { body })
    : sendDirectMessage(
        { conversationId: chat.conversationId, supplierId: chat.conversationId ? null : chat.supplierId },
        { body },
        idempotencyKey,
      );
}

function Composer({
  chat,
  draft,
  refresh,
  onSent,
}: {
  chat: Chat;
  draft: boolean;
  refresh: () => Promise<void>;
  onSent: (conversationId: string | null) => void;
}) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const busy = useRef(false);
  // Reused on retry so the server does not store a message twice; cleared only after a successful send.
  const key = useRef<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  if (chat.closed) return <Notice>Messaging is closed for this request.</Notice>;

  async function send() {
    const body = text.trim();
    if (!body || busy.current) return;
    const parsed = messageSchema.safeParse({ body });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Check your message.");
      return;
    }
    busy.current = true;
    setSending(true);
    let res: SendResult | null = null;
    try {
      res = await deliver(chat, body, (key.current ??= crypto.randomUUID()));
    } catch {
      toast.error(NETWORK_ERROR);
    }
    if (res && !res.ok) toast.error(res.error);
    if (res?.ok) {
      setText("");
      key.current = null;
      await refresh();
      onSent(res.conversationId ?? null);
    }
    busy.current = false;
    setSending(false);
  }

  return (
    <form
      ref={formRef}
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
      className="flex items-end gap-2"
    >
      <Textarea
        aria-label="Message"
        name="body"
        rows={1}
        maxLength={2000}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={draft ? "Send a message to start this chat." : "Write a message…"}
        className="max-h-40 min-h-9 min-w-0 flex-1 resize-none"
        onKeyDown={(e) => {
          // Enter sends, Shift+Enter adds a line. Enter never adds a line, so an empty Enter does nothing.
          if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
          e.preventDefault();
          if (!sending && text.trim()) formRef.current?.requestSubmit();
        }}
      />
      <Button type="submit" size="icon-lg" aria-label="Send message" disabled={sending} className="rounded-full">
        <SendIcon aria-hidden />
      </Button>
    </form>
  );
}

type PanelProps = {
  data: ChatList;
  refresh: () => Promise<void>;
  target: OpenChatDetail | null;
  onTargetHandled?: () => void;
  seeAllHref?: string;
  onClose?: () => void;
};

/** Single-pane chat list and conversation. Sends go through server actions only. */
export function ChatPanel({ data, refresh, target, onTargetHandled, seeAllHref, onClose }: PanelProps) {
  const [query, setQuery] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Chat | null>(null);
  const rows = useRef(new Map<string, HTMLButtonElement>());
  const log = useRef<HTMLDivElement>(null);

  const open = (draft?.id === openId ? draft : data.chats.find((c) => c.id === openId)) ?? null;
  const openKey = open?.id ?? null;
  const openUnread = open?.unread ?? false;

  // Opens the supplier's direct chat, or a draft when there is none. Own business never opens a draft.
  useEffect(() => {
    if (!target?.supplierId) return;
    const supplierId = target.supplierId;
    if (supplierId === data.supplierId) {
      toast.error("This is your own business.");
    } else {
      const existing = data.chats.find((c) => c.kind === "direct" && c.side === "buyer" && c.supplierId === supplierId);
      const next = existing ?? draftFor(supplierId, target.supplierName ?? "Supplier");
      // The target is an external open request from the parent (the menu event), so syncing it into state here is intended.
      // eslint-disable-next-line react-hooks/set-state-in-effect -- external open request; the parent clears it via onTargetHandled
      setDraft(existing ? null : next);
      setOpenId(next.id);
    }
    onTargetHandled?.();
  }, [target, data, onTargetHandled]);

  // Marks an unread chat as read once. Stays unread on failure; the effect only reruns when the chat or its flag changes.
  useEffect(() => {
    if (!openKey || !openUnread) return;
    void (async () => {
      try {
        await markChatRead(openKey);
        await refresh();
      } catch {
        // Still unread; opening the chat again retries.
      }
    })();
  }, [openKey, openUnread, refresh]);

  // Opens on the newest message: when a chat is opened, and when a message is added.
  useEffect(() => {
    const el = log.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [openKey, open?.messages.length]);

  function back() {
    const id = openId;
    setOpenId(null);
    setDraft(null);
    requestAnimationFrame(() => (id ? rows.current.get(id) : undefined)?.focus());
  }

  // A draft becomes the real conversation once its first message is saved.
  function sent(chatId: string, conversationId: string | null) {
    if (!conversationId) return;
    setDraft((d) => (d?.id === chatId ? null : d));
    setOpenId((cur) => (cur === chatId ? conversationId : cur));
  }

  if (open) {
    const isDraft = draft?.id === open.id;
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center gap-3 border-b p-3">
          <Button type="button" variant="ghost" size="icon" aria-label="Back to chats" onClick={back}>
            <ArrowLeftIcon aria-hidden />
          </Button>
          <Avatar name={open.name} className="size-9 text-sm" />
          <div className="flex min-w-0 flex-1 flex-col">
            <h3 className="truncate font-semibold">{open.name}</h3>
            {open.subtitle && <p className="truncate text-xs text-muted-foreground">{open.subtitle}</p>}
          </div>
          {open.href && (
            <Link href={open.href} onClick={() => onClose?.()} className="shrink-0 text-sm font-medium text-primary hover:underline">
              {open.kind === "rfq" ? "View request" : "View supplier"}
            </Link>
          )}
        </header>

        <div
          ref={log}
          role="log"
          aria-live="polite"
          className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3"
        >
          {open.messages.length ? (
            open.messages.flatMap((m, i) => {
              const mine = m.senderId === data.viewerId;
              const day = date(m.createdAt);
              const newDay = i === 0 || date(open.messages[i - 1].createdAt) !== day;
              return [
                newDay && (
                  <div
                    key={`day-${m.id}`}
                    className="self-center rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground"
                  >
                    {day}
                  </div>
                ),
                <div
                  key={m.id}
                  className={cn("flex max-w-[85%] flex-col gap-1", mine ? "ml-auto items-end" : "mr-auto items-start")}
                >
                  <p
                    className={cn(
                      "rounded-2xl px-3 py-2 text-sm break-words whitespace-pre-line",
                      mine ? "rounded-br-sm bg-primary text-primary-foreground" : "rounded-bl-sm bg-muted",
                    )}
                  >
                    {m.body}
                  </p>
                  <time dateTime={m.createdAt} className="text-xs text-muted-foreground">
                    {clock(m.createdAt)}
                    {mine && " · Sent"}
                  </time>
                </div>,
              ];
            })
          ) : (
            <p className="text-sm text-muted-foreground">No messages in this conversation yet.</p>
          )}
        </div>

        <div className="shrink-0 border-t p-3">
          <Composer
            key={open.id}
            chat={open}
            draft={isDraft}
            refresh={refresh}
            onSent={(conversationId) => sent(open.id, conversationId)}
          />
        </div>
      </div>
    );
  }

  const shown = filterChats(data.chats, query, unreadOnly);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-col gap-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-2xl font-bold">Chats</h2>
          {onClose && (
            <Button type="button" variant="ghost" size="icon" aria-label="Close messages" onClick={onClose}>
              <XIcon aria-hidden />
            </Button>
          )}
        </div>
        <Input
          type="search"
          aria-label="Search chats"
          placeholder="Search chats"
          className="rounded-full"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="flex gap-2">
          <Pill pressed={!unreadOnly} onClick={() => setUnreadOnly(false)}>
            All
          </Pill>
          <Pill pressed={unreadOnly} onClick={() => setUnreadOnly(true)}>
            Unread
          </Pill>
        </div>
      </div>

      {shown.length ? (
        <ul className="min-h-0 flex-1 divide-y overflow-y-auto border-t">
          {shown.map((c) => {
            const last = c.messages.at(-1);
            const at = c.lastAt;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  ref={(el) => {
                    if (el) rows.current.set(c.id, el);
                    else rows.current.delete(c.id);
                  }}
                  onClick={() => setOpenId(c.id)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <Avatar name={c.name} className="size-12 text-base" />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className={cn("truncate text-sm", c.unread ? "font-semibold" : "font-normal")}>{c.name}</span>
                    {c.kind === "rfq" && <span className="truncate text-xs text-muted-foreground">{c.subtitle}</span>}
                    <span className={cn("truncate text-sm", c.unread ? "font-semibold" : "text-muted-foreground")}>
                      {last ? last.body : "No messages yet"}
                      {at && (
                        <>
                          {" · "}
                          <time dateTime={at} suppressHydrationWarning>
                            {ago(at)}
                          </time>
                        </>
                      )}
                    </span>
                  </span>
                  {c.unread && (
                    <>
                      <span aria-hidden className="size-2.5 shrink-0 rounded-full bg-primary" />
                      <span className="sr-only">Unread</span>
                    </>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="min-h-0 flex-1 p-4 text-center text-sm text-muted-foreground">
          {data.chats.length
            ? "No chats match."
            : "No chats yet. Use Message supplier on any supplier card to start one."}
        </p>
      )}

      {seeAllHref && (
        <div className="shrink-0 border-t p-3 text-center">
          <Link href={seeAllHref} onClick={() => onClose?.()} className="text-sm font-medium text-primary hover:underline">
            See all in Messages
          </Link>
        </div>
      )}
    </div>
  );
}

/** Full-page chat: holds the list in state and polls every 30 seconds while the tab is visible. */
export function ChatPage({ initial }: { initial: ChatList }) {
  const [data, setData] = useState(initial);
  const refresh = useCallback(async () => {
    try {
      const next = await fetchChats();
      if (next) setData(next);
    } catch {
      // Keep the list on screen; the next poll retries.
    }
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 30_000);
    return () => clearInterval(id);
  }, [refresh]);

  return (
    <div className="mx-auto flex h-[75vh] min-h-[28rem] max-w-2xl flex-col overflow-hidden rounded-xl border bg-card">
      <ChatPanel data={data} refresh={refresh} target={null} />
    </div>
  );
}
