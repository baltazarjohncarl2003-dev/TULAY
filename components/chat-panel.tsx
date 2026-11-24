"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeftIcon, FileTextIcon, MessageSquareIcon, SendIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { Notice } from "@/components/common";
import { RfqCardView } from "@/components/rfq-card";
import { RfqMessageForm } from "@/components/rfq-message-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { fetchChats, markChatRead, sendDirectMessage } from "@/lib/actions/chats";
import { sendRfqMessage } from "@/lib/actions/deals";
import {
  type Chat,
  type ChatFilter,
  type ChatList,
  type OpenChatDetail,
  type RfqProduct,
  filterChats,
} from "@/lib/chats";
import { date, php } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
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
        "shrink-0 rounded-full px-3 py-1 text-sm",
        pressed ? "bg-accent font-semibold text-primary" : "text-muted-foreground hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

const FILTER_LABEL: Record<ChatFilter, string> = {
  all: "All",
  unread: "Unread",
  buyers: "Buyers",
  suppliers: "Suppliers",
  negotiations: "Negotiations",
};

/** Local draft chat for a supplier with no conversation yet. It is saved on the first message or RFQ. */
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

/** Only a buyer's own direct chat with a supplier takes a private RFQ. */
const takesRfq = (c: Chat) => c.kind === "direct" && c.side === "buyer";

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

type RfqDefaults = { city: string; province: string };
type RfqState = { product: RfqProduct | null } | null;

/**
 * Which chat is open, the draft for a supplier with no chat yet, and the RFQ form, shared by the
 * dropdown and the full page. Also marks chats read and handles open requests from outside.
 */
function useChatSelection(
  data: ChatList,
  refresh: () => Promise<void>,
  target: OpenChatDetail | null,
  onTargetHandled?: () => void,
) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Chat | null>(null);
  const [rfq, setRfq] = useState<RfqState>(null);

  const open = (draft?.id === openId ? draft : data.chats.find((c) => c.id === openId)) ?? null;
  const openKey = open?.id ?? null;
  const openUnread = open?.unread ?? false;

  // Opens a chat by id, or the supplier's direct chat (a draft when there is none). Own business never opens a draft.
  useEffect(() => {
    if (!target) return;
    // The target is an external open request from the parent, so syncing it into state here is intended.
    /* eslint-disable react-hooks/set-state-in-effect -- external open request; the parent clears it via onTargetHandled */
    if (target.chatId) {
      if (data.chats.some((c) => c.id === target.chatId)) {
        setDraft(null);
        setOpenId(target.chatId);
      }
    } else if (target.supplierId) {
      const supplierId = target.supplierId;
      if (supplierId === data.supplierId) {
        toast.error("This is your own business.");
      } else {
        const existing = data.chats.find((c) => takesRfq(c) && c.supplierId === supplierId);
        const next = existing ?? draftFor(supplierId, target.supplierName ?? "Supplier");
        setDraft(existing ? null : next);
        setOpenId(next.id);
        setRfq(target.rfq ?? null);
      }
    }
    /* eslint-enable react-hooks/set-state-in-effect */
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

  const select = useCallback((id: string | null) => {
    setOpenId(id);
    setDraft(null);
    setRfq(null);
  }, []);

  // A draft becomes the real conversation once its first message is saved.
  const sent = useCallback((chatId: string, conversationId: string | null) => {
    if (!conversationId) return;
    setDraft((d) => (d?.id === chatId ? null : d));
    setOpenId((cur) => (cur === chatId ? conversationId : cur));
  }, []);

  return { open, isDraft: !!open && draft?.id === open.id, select, sent, rfq, setRfq };
}

type Selection = ReturnType<typeof useChatSelection>;

function ChatListPane({
  data,
  selectedId,
  onOpen,
  rows,
  onClose,
  seeAllHref,
}: {
  data: ChatList;
  selectedId: string | null;
  onOpen: (id: string) => void;
  rows: React.RefObject<Map<string, HTMLButtonElement>>;
  onClose?: () => void;
  seeAllHref?: string;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ChatFilter>("all");
  const shown = filterChats(data.chats, query, filter);
  // Buyers/Suppliers only mean something to accounts that also sell.
  const filters: ChatFilter[] = data.supplierId
    ? ["all", "unread", "buyers", "suppliers", "negotiations"]
    : ["all", "unread", "negotiations"];

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
        <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
          {filters.map((f) => (
            <Pill key={f} pressed={filter === f} onClick={() => setFilter(f)}>
              {FILTER_LABEL[f]}
            </Pill>
          ))}
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
                  aria-current={selectedId === c.id || undefined}
                  onClick={() => onOpen(c.id)}
                  className={cn(
                    "flex w-full items-center gap-3 px-4 py-3 text-left outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50",
                    selectedId === c.id && "bg-muted",
                  )}
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
            : "No chats yet. Use Message supplier or Request a Quote on any supplier to start one."}
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

function ChatThreadPane({
  data,
  chat,
  sel,
  refresh,
  rfqDefaults,
  onBack,
  backClassName,
  onClose,
}: {
  data: ChatList;
  chat: Chat;
  sel: Selection;
  refresh: () => Promise<void>;
  rfqDefaults: RfqDefaults;
  onBack: () => void;
  backClassName?: string;
  onClose?: () => void;
}) {
  const log = useRef<HTMLDivElement>(null);

  // Opens on the newest message: when a chat is opened, and when a message is added.
  useEffect(() => {
    const el = log.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat.id, chat.messages.length]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center gap-3 border-b p-3">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Back to chats"
          onClick={onBack}
          className={backClassName}
        >
          <ArrowLeftIcon aria-hidden />
        </Button>
        <Avatar name={chat.name} className="size-9 text-sm" />
        <div className="flex min-w-0 flex-1 flex-col">
          <h3 className="truncate font-semibold">{chat.name}</h3>
          <p className="truncate text-xs text-muted-foreground">
            {chat.subtitle || (chat.side === "buyer" ? "Supplier" : "Buyer")}
          </p>
        </div>
        {takesRfq(chat) && !sel.rfq && (
          <Button
            type="button"
            size="icon"
            variant="outline"
            aria-label="Request a quote"
            title="Request a quote"
            onClick={() => sel.setRfq({ product: null })}
          >
            <FileTextIcon aria-hidden />
          </Button>
        )}
        {chat.href && (
          <Link
            href={chat.href}
            onClick={() => onClose?.()}
            className="hidden shrink-0 text-sm font-medium text-primary hover:underline sm:inline"
          >
            {chat.kind === "rfq" ? "View request" : chat.side === "buyer" ? "View supplier" : ""}
          </Link>
        )}
      </header>

      {sel.rfq && takesRfq(chat) ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <RfqMessageForm
            supplierId={chat.supplierId}
            supplierName={chat.name}
            product={sel.rfq.product}
            defaults={rfqDefaults}
            onCancel={() => sel.setRfq(null)}
            onSent={async (conversationId) => {
              sel.setRfq(null);
              await refresh();
              sel.sent(chat.id, conversationId);
            }}
          />
        </div>
      ) : (
        <>
          <div
            ref={log}
            role="log"
            aria-live="polite"
            className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3"
          >
            {chat.messages.length ? (
              chat.messages.flatMap((m, i) => {
                const mine = m.senderId === data.viewerId;
                const day = date(m.createdAt);
                const newDay = i === 0 || date(chat.messages[i - 1].createdAt) !== day;
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
                    className={cn(
                      "flex flex-col gap-1",
                      m.rfq ? "w-full max-w-sm" : "max-w-[85%]",
                      mine ? "ml-auto items-end" : "mr-auto items-start",
                    )}
                  >
                    {m.rfq ? (
                      <RfqCardView rfq={m.rfq} mine={mine} />
                    ) : (
                      <p
                        className={cn(
                          "rounded-2xl px-3 py-2 text-sm break-words whitespace-pre-line",
                          mine ? "rounded-br-sm bg-primary text-primary-foreground" : "rounded-bl-sm bg-muted",
                        )}
                      >
                        {m.body}
                      </p>
                    )}
                    <time dateTime={m.createdAt} className="text-xs text-muted-foreground">
                      {clock(m.createdAt)}
                      {mine && " · Sent"}
                    </time>
                  </div>,
                ];
              })
            ) : (
              <p className="text-sm text-muted-foreground">
                {takesRfq(chat)
                  ? "No messages yet. Send a message, or use Request a quote to send the supplier your requirements."
                  : "No messages in this conversation yet."}
              </p>
            )}
          </div>

          <div className="shrink-0 border-t p-3">
            <Composer
              key={chat.id}
              chat={chat}
              draft={sel.isDraft}
              refresh={refresh}
              onSent={(conversationId) => sel.sent(chat.id, conversationId)}
            />
          </div>
        </>
      )}
    </div>
  );
}

/** The latest RFQ in the chat, for the details panel. */
function ChatDetails({ chat }: { chat: Chat }) {
  const latest = chat.messages.findLast((m) => m.rfq !== null)?.rfq ?? null;
  return (
    <div className="flex flex-col gap-4 text-sm">
      <div className="flex flex-col items-center gap-2 text-center">
        <Avatar name={chat.name} className="size-16 text-xl" />
        <p className="font-semibold">{chat.name}</p>
        <p className="text-xs text-muted-foreground">{chat.side === "buyer" ? "Supplier" : "Buyer"}</p>
        {chat.href && (
          <Link href={chat.href} className="font-medium text-primary hover:underline">
            {chat.kind === "rfq" ? "View request" : chat.side === "buyer" ? "View supplier" : ""}
          </Link>
        )}
      </div>
      <section className="flex flex-col gap-2 border-t pt-4">
        <h4 className="font-semibold">Request</h4>
        {chat.kind === "rfq" ? (
          <p className="text-muted-foreground">{chat.subtitle}</p>
        ) : latest ? (
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <dt className="text-muted-foreground">Product</dt>
            <dd>{latest.productName}</dd>
            <dt className="text-muted-foreground">Quantity</dt>
            <dd>
              {latest.quantity.toLocaleString("en-PH")} {latest.unit}
            </dd>
            {latest.targetPriceCentavos !== null && (
              <>
                <dt className="text-muted-foreground">Target</dt>
                <dd>
                  {php(latest.targetPriceCentavos)} per {latest.unit}
                </dd>
                <dt className="text-muted-foreground">Target total</dt>
                <dd>{php(latest.targetPriceCentavos * latest.quantity)}</dd>
              </>
            )}
            <dt className="text-muted-foreground">Deliver to</dt>
            <dd>
              {latest.city}, {latest.province}
            </dd>
          </dl>
        ) : (
          <p className="text-muted-foreground">No request for quotation in this chat yet.</p>
        )}
      </section>
    </div>
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

const NO_DEFAULTS: RfqDefaults = { city: "", province: "" };

/** Single-pane chat list and conversation (the messages dropdown). Sends go through server actions only. */
export function ChatPanel({ data, refresh, target, onTargetHandled, seeAllHref, onClose }: PanelProps) {
  const sel = useChatSelection(data, refresh, target, onTargetHandled);
  const rows = useRef(new Map<string, HTMLButtonElement>());

  function back() {
    const id = sel.open?.id;
    sel.select(null);
    requestAnimationFrame(() => (id ? rows.current.get(id) : undefined)?.focus());
  }

  if (sel.open) {
    return (
      <ChatThreadPane
        data={data}
        chat={sel.open}
        sel={sel}
        refresh={refresh}
        rfqDefaults={NO_DEFAULTS}
        onBack={back}
        onClose={onClose}
      />
    );
  }
  return (
    <ChatListPane data={data} selectedId={null} onOpen={sel.select} rows={rows} onClose={onClose} seeAllHref={seeAllHref} />
  );
}

/**
 * Full-page Messenger: chat list, conversation and (on wide screens) details side by side; one pane at a
 * time on phones. Updates live through Realtime (RLS decides which rows arrive) and polls every 30 seconds
 * as a fallback while the tab is visible.
 */
export function ChatPage({
  initial,
  target: initialTarget = null,
  rfqDefaults = NO_DEFAULTS,
}: {
  initial: ChatList;
  target?: OpenChatDetail | null;
  rfqDefaults?: RfqDefaults;
}) {
  const [data, setData] = useState(initial);
  const [target, setTarget] = useState(initialTarget);
  const rows = useRef(new Map<string, HTMLButtonElement>());

  const refresh = useCallback(async () => {
    try {
      const next = await fetchChats();
      if (next) setData(next);
    } catch {
      // Keep the list on screen; the next poll retries.
    }
  }, []);

  // The query stays in the address bar: rewriting it makes the App Router re-render the page from the server.
  const handled = useCallback(() => setTarget(null), []);

  const sel = useChatSelection(data, refresh, target, handled);

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 30_000);
    return () => clearInterval(id);
  }, [refresh]);

  // A new message in any chat the viewer can see triggers one refresh (bursts are coalesced).
  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const nudge = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void refresh(), 300);
    };
    const channel = supabase
      .channel("messenger")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "direct_messages" }, nudge)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "rfq_messages" }, nudge)
      .subscribe();
    return () => {
      clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [refresh]);

  const open = sel.open;
  return (
    <div className="mx-auto flex h-[calc(100dvh-11rem)] min-h-[32rem] w-full max-w-6xl overflow-hidden rounded-xl border bg-card">
      <aside className={cn("min-h-0 w-full flex-col md:flex md:w-80 md:shrink-0 md:border-r", open ? "hidden" : "flex")}>
        <ChatListPane data={data} selectedId={open?.id ?? null} onOpen={sel.select} rows={rows} />
      </aside>
      <section className={cn("min-h-0 min-w-0 flex-1 flex-col md:flex", open ? "flex" : "hidden")}>
        {open ? (
          <ChatThreadPane
            data={data}
            chat={open}
            sel={sel}
            refresh={refresh}
            rfqDefaults={rfqDefaults}
            onBack={() => {
              const id = open.id;
              sel.select(null);
              requestAnimationFrame(() => rows.current.get(id)?.focus());
            }}
            backClassName="md:hidden"
          />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center text-sm text-muted-foreground">
            <MessageSquareIcon aria-hidden className="size-10" />
            <p>Pick a chat to read it.</p>
          </div>
        )}
      </section>
      {open && (
        <aside className="hidden w-72 shrink-0 overflow-y-auto border-l p-4 xl:block">
          <ChatDetails chat={open} />
        </aside>
      )}
    </div>
  );
}
