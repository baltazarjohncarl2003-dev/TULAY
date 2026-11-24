import type { Agreement, DealOrder } from "@/lib/agreements";
import type { ChatOffer } from "@/lib/offers";
import type { Thread } from "@/lib/threads";
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

export type Chat = {
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
  messages: ChatMessage[]; // oldest first
  offers: ChatOffer[]; // direct chats only, oldest first
  agreements: Agreement[]; // direct chats only
  dealOrders: DealOrder[]; // orders made from this chat's agreements
};

export type ChatList = {
  viewerId: string;
  supplierId: string | null;
  chats: Chat[];
  /** Admin setting: offer totals at or above this need a downpayment above 0%. */
  minDownpaymentTotalCentavos: number;
  /** Server time of this load; offer expiry is shown as of then (the server decides on every answer). */
  loadedAt: string;
  /** The viewer's saved delivery addresses, for agreements where they are the buyer. */
  addresses: Address[];
};

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

/** Unread = the newest message from the other party is after this viewer's read marker. */
export function isUnread(messages: ChatMessage[], viewerId: string, lastReadAt: string | undefined): boolean {
  const theirs = messages.filter((m) => m.senderId !== viewerId).at(-1);
  if (!theirs) return false;
  return !lastReadAt || new Date(theirs.createdAt).getTime() > new Date(lastReadAt).getTime();
}

export function rfqChat(t: Thread, side: Chat["side"], viewerId: string, lastReadAt: string | undefined): Chat {
  const messages = t.messages.map(({ id, senderId, body, createdAt }) => ({
    id,
    senderId,
    body,
    createdAt,
    rfq: null,
    offerId: null,
  }));
  return {
    id: t.id,
    kind: "rfq",
    side,
    name: t.counterpartyName,
    subtitle: `${t.rfqRef} · ${t.product}`,
    conversationId: null,
    rfqId: t.rfqId,
    supplierId: t.supplierId,
    href: `/${side}/rfqs/${t.rfqId}`,
    closed: t.rfqStatus === "cancelled", // matches send_rfq_message
    unread: isUnread(messages, viewerId, lastReadAt),
    lastAt: t.lastAt,
    messages,
    offers: [],
    agreements: [],
    dealOrders: [],
  };
}

/** Newest activity first; chats with no messages last. */
export function sortChats(chats: Chat[]): Chat[] {
  return [...chats].sort((a, b) => (b.lastAt ?? "").localeCompare(a.lastAt ?? ""));
}

export const CHAT_FILTERS = ["all", "unread", "buyers", "suppliers", "negotiations"] as const;
export type ChatFilter = (typeof CHAT_FILTERS)[number];

/** A request thread, or a direct chat holding an RFQ or an offer. */
export const isNegotiation = (c: Chat) => c.kind === "rfq" || c.offers.length > 0 || c.messages.some((m) => m.rfq !== null);

const MATCHES: Record<ChatFilter, (c: Chat) => boolean> = {
  all: () => true,
  unread: (c) => c.unread,
  buyers: (c) => c.side === "supplier", // the other party is a buyer
  suppliers: (c) => c.side === "buyer",
  negotiations: isNegotiation,
};

/** Case-insensitive match on name, subtitle and message text, within one filter. */
export function filterChats(chats: Chat[], query: string, filter: ChatFilter): Chat[] {
  const q = query.trim().toLowerCase();
  return chats.filter(
    (c) =>
      MATCHES[filter](c) &&
      (!q || [c.name, c.subtitle, ...c.messages.map((m) => m.body)].some((s) => s.toLowerCase().includes(q))),
  );
}
