import type { Thread } from "@/lib/threads";

export type ChatMessage = { id: string; senderId: string; body: string; createdAt: string };

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
};

export type ChatList = { viewerId: string; supplierId: string | null; chats: Chat[] };

/** Window event that opens the messages dropdown; with a supplier it opens that supplier's chat. */
export const OPEN_CHAT_EVENT = "tulay:open-chat";
export type OpenChatDetail = { supplierId?: string; supplierName?: string };

/** Unread = the newest message from the other party is after this viewer's read marker. */
export function isUnread(messages: ChatMessage[], viewerId: string, lastReadAt: string | undefined): boolean {
  const theirs = messages.filter((m) => m.senderId !== viewerId).at(-1);
  if (!theirs) return false;
  return !lastReadAt || new Date(theirs.createdAt).getTime() > new Date(lastReadAt).getTime();
}

export function rfqChat(t: Thread, side: Chat["side"], viewerId: string, lastReadAt: string | undefined): Chat {
  const messages = t.messages.map(({ id, senderId, body, createdAt }) => ({ id, senderId, body, createdAt }));
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
  };
}

/** Newest activity first; chats with no messages last. */
export function sortChats(chats: Chat[]): Chat[] {
  return [...chats].sort((a, b) => (b.lastAt ?? "").localeCompare(a.lastAt ?? ""));
}

/** Case-insensitive match on name, subtitle and message text. */
export function filterChats(chats: Chat[], query: string, unreadOnly: boolean): Chat[] {
  const q = query.trim().toLowerCase();
  return chats.filter(
    (c) =>
      (!unreadOnly || c.unread) &&
      (!q || [c.name, c.subtitle, ...c.messages.map((m) => m.body)].some((s) => s.toLowerCase().includes(q))),
  );
}
