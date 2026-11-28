import type { Agreement, DealOrder } from "@/lib/agreements";
import type { ChatOffer } from "@/lib/offers";
import type { Address, Unit } from "@/lib/types";

/** A request for quotation as the buyer sent it (frozen in the message). Money in integer centavos. */
export type RfqCard = {
  productId: string | null;
  productName: string;
  productType: string;
  quantity: number;
  unit: Unit;
  targetPriceCentavos: number | null;
  specs: string;
  city: string;
  province: string;
  requiredBy: string | null; // YYYY-MM-DD
  notes: string;
};

/** rfq is set on structured RFQ messages, offerId on offer events (a chat_offers id); text messages have neither. */
export type ChatMessage = {
  id: string;
  senderId: string;
  body: string;
  createdAt: string;
  rfq: RfqCard | null;
  offerId: string | null;
};

/** One row of the chat list (public.chat_inbox). No messages: those load with the thread. */
export type ChatSummary = {
  id: string; // direct conversation id, or `<rfqId>:<supplierId>`
  kind: "direct" | "rfq";
  side: "buyer" | "supplier"; // the viewer's side of this chat
  name: string;
  subtitle: string; // RFQ ref and product; empty for direct chats
  conversationId: string | null; // direct chats only
  rfqId: string | null; // RFQ chats only
  supplierId: string;
  href: string | null; // RFQ or supplier profile
  closed: boolean;
  unread: boolean;
  lastAt: string | null;
  lastBody: string | null; // newest message text, for the list preview and search
  negotiation: boolean; // an RFQ thread, or a direct chat holding an RFQ or an offer
};

/** One open chat's content. Messages are the newest page (oldest first); older pages load on request. */
export type ChatThread = {
  messages: ChatMessage[];
  hasOlder: boolean;
  offers: ChatOffer[]; // direct chats only, oldest first
  agreements: Agreement[]; // direct chats only
  dealOrders: DealOrder[]; // orders made from this chat's agreements
  /** The newest RFQ card in the whole chat, even when it is older than the loaded messages. */
  latestRfq: RfqCard | null;
  /** The viewer's saved delivery addresses, for agreements where they are the buyer. */
  addresses: Address[];
  /** Admin setting: offer totals at or above this need a downpayment above 0%. */
  minDownpaymentTotalCentavos: number;
  /** Server time of this load; offer expiry is shown as of then (the server decides on every answer). */
  loadedAt: string;
};

/** An open chat: its list row plus its content. */
export type Chat = ChatSummary & ChatThread;

export type ChatList = {
  viewerId: string;
  supplierId: string | null;
  chats: ChatSummary[]; // newest activity first
  /** More (older) chats exist after the last row; load them with inboxCursor(last row). */
  hasMore: boolean;
  loadedAt: string;
};

/** Messages per thread page and chats per list page. */
export const CHAT_PAGE = 50;
export const INBOX_PAGE = 100;

/** Position of a message, for loading the page before it. */
export type MessageCursor = { at: string; id: string };
/** Position of a chat list row; at is "-infinity" for chats with no messages (they sort last). */
export type InboxCursor = { at: string; id: string };

export const messageCursor = (m: ChatMessage): MessageCursor => ({ at: m.createdAt, id: m.id });
export const inboxCursor = (c: ChatSummary): InboxCursor => ({ at: c.lastAt ?? "-infinity", id: c.id });

/** A thread with nothing in it yet (a draft chat, or before the first load). */
export const emptyThread = (loadedAt: string): ChatThread => ({
  messages: [], hasOlder: false, offers: [], agreements: [], dealOrders: [], latestRfq: null, addresses: [],
  minDownpaymentTotalCentavos: 0, loadedAt,
});

/** Oldest first: by time, then by id (ids are increasing integers). */
function byPosition(a: ChatMessage, b: ChatMessage): number {
  const t = Date.parse(a.createdAt) - Date.parse(b.createdAt);
  return t || Number(BigInt(a.id) - BigInt(b.id));
}

/**
 * Union of two message lists by id, oldest first. Used to add an older page, and to fold a fresh newest page
 * into what is on screen after a refresh (a message present in both appears once).
 */
export function mergeMessages(a: ChatMessage[], b: ChatMessage[]): ChatMessage[] {
  const byId = new Map(a.map((m) => [m.id, m]));
  for (const m of b) byId.set(m.id, m);
  return [...byId.values()].sort(byPosition);
}

/**
 * Folds a freshly loaded newest page into the open chat. When the fresh page reaches back into what is already
 * on screen, the two are merged (older pages the viewer loaded stay); otherwise more than a page arrived in
 * between and the fresh page replaces the old messages.
 */
export function refreshThread(current: ChatThread, fresh: ChatThread): ChatThread {
  const oldestFresh = fresh.messages[0];
  const newestShown = current.messages.at(-1);
  const overlaps = !fresh.hasOlder || !newestShown || !oldestFresh || byPosition(oldestFresh, newestShown) <= 0;
  if (!overlaps) return fresh;
  return { ...fresh, messages: mergeMessages(current.messages, fresh.messages), hasOlder: current.hasOlder && fresh.hasOlder };
}

/** Adds the next page of the chat list (loaded with inboxCursor of the last row) below what is shown. */
export function appendInbox(current: ChatList, page: ChatList): ChatList {
  const shown = new Set(current.chats.map((c) => c.id));
  return { ...page, chats: [...current.chats, ...page.chats.filter((c) => !shown.has(c.id))] };
}

const listTime = (c: ChatSummary) => (c.lastAt ? Date.parse(c.lastAt) : -Infinity);

/**
 * Folds a refreshed first page into the list on screen. Chats from further pages the viewer already loaded stay
 * below it, unless they moved up into the fresh page.
 */
export function refreshInbox(current: ChatList, fresh: ChatList): ChatList {
  const last = fresh.chats.at(-1);
  if (!fresh.hasMore || !last) return fresh;
  const inFresh = new Set(fresh.chats.map((c) => c.id));
  const below = current.chats.filter(
    (c) => !inFresh.has(c.id) && (listTime(c) < listTime(last) || (listTime(c) === listTime(last) && c.id < last.id)),
  );
  return { ...fresh, chats: [...fresh.chats, ...below], hasMore: below.length ? current.hasMore : fresh.hasMore };
}

/** Window event that opens the messages dropdown; with a supplier it opens that supplier's chat. */
export const OPEN_CHAT_EVENT = "tulay:open-chat";
/** The listing an RFQ is about, for prefilling the RFQ form. */
export type RfqProduct = { id: string; title: string; unit: Unit; moq: number; variants: string[] };

/**
 * What to open: a chat by id, or the viewer's buyer chat with a supplier.
 * rfq opens the RFQ form in that chat (product null = the buyer names the product).
 */
export type OpenChatDetail = {
  chatId?: string;
  supplierId?: string;
  supplierName?: string;
  rfq?: { product: RfqProduct | null } | null;
};

export const CHAT_FILTERS = ["all", "unread", "buyers", "suppliers", "negotiations"] as const;
export type ChatFilter = (typeof CHAT_FILTERS)[number];

const MATCHES: Record<ChatFilter, (c: ChatSummary) => boolean> = {
  all: () => true,
  unread: (c) => c.unread,
  buyers: (c) => c.side === "supplier", // the other party is a buyer
  suppliers: (c) => c.side === "buyer",
  negotiations: (c) => c.negotiation,
};

/** Case-insensitive match on name, subtitle and the newest message, within one filter. */
export function filterChats(chats: ChatSummary[], query: string, filter: ChatFilter): ChatSummary[] {
  const q = query.trim().toLowerCase();
  return chats.filter(
    (c) => MATCHES[filter](c) && (!q || [c.name, c.subtitle, c.lastBody ?? ""].some((s) => s.toLowerCase().includes(q))),
  );
}
