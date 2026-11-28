import "server-only";
import { getSessionUser } from "@/lib/auth";
import { z } from "zod";
import {
  CHAT_PAGE,
  INBOX_PAGE,
  type ChatList,
  type ChatMessage,
  type ChatSummary,
  type ChatThread,
  type InboxCursor,
  type MessageCursor,
  type OpenChatDetail,
  type RfqCard,
} from "@/lib/chats";
import { getProduct } from "@/lib/data/catalog";
import { getNumberSettings } from "@/lib/data/settings";
import type { Agreement, DealOrder } from "@/lib/agreements";
import { listMyAddresses } from "@/lib/data/orders";
import type { ChatOffer } from "@/lib/offers";
import type { ShipTo } from "@/lib/types";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

// The payload send_direct_rfq builds. Parsed rather than cast so a shape change shows as an error, not a broken card.
const rfqPayload = z.object({
  productName: z.string(),
  productType: z.string(),
  quantity: z.number().int(),
  unit: z.enum(["pcs", "boxes", "packs", "sets", "kg"]),
  targetPriceCentavos: z.number().int().nullable(),
  specs: z.string(),
  city: z.string(),
  province: z.string(),
  requiredBy: z.string().nullable(),
  notes: z.string(),
});

function toRfqCard(payload: unknown, productId: string | null): RfqCard {
  return { ...rfqPayload.parse(payload), productId };
}

const UUID = z.string().uuid();
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * What the Messages page opens from its link: `?c=<chat id>`, or `?supplier=<id>` with `&product=<listing id>`
 * (RFQ form about that listing) or `&rfq=1` (RFQ form, buyer names the product). Unknown ids open nothing.
 */
export async function loadChatTarget(sp: Record<string, string | string[] | undefined>): Promise<OpenChatDetail | null> {
  const chatId = one(sp.c);
  if (chatId && chatId.length <= 73) return { chatId };
  const supplierId = one(sp.supplier);
  if (!supplierId || !UUID.safeParse(supplierId).success) return null;

  const productId = one(sp.product);
  if (productId) {
    const found = await getProduct(productId);
    if (found && found.product.supplierId === supplierId && found.product.status === "approved") {
      const p = found.product;
      return {
        supplierId,
        supplierName: found.supplier.businessName,
        rfq: { product: { id: p.id, title: p.title, unit: p.unit, moq: p.moq, variants: (p.variants ?? []).map((v) => v.name) } },
      };
    }
  }
  const supabase = await createClient();
  const { data } = await supabase.from("suppliers").select("business_name").eq("id", supplierId).maybeSingle();
  if (!data) return null;
  return { supplierId, supplierName: data.business_name, rfq: one(sp.rfq) === "1" || productId ? { product: null } : null };
}

const offerPayload = z.object({ offerId: z.string().uuid() });

type OfferRow = Database["public"]["Tables"]["chat_offers"]["Row"];

function toChatOffer(r: OfferRow): ChatOffer {
  return {
    id: r.id,
    seq: r.seq,
    actorId: r.actor_id,
    action: r.action,
    revision: r.revision,
    relatedOfferId: r.related_offer_id,
    productName: r.product_name,
    productType: r.product_type,
    specs: r.specs,
    unit: r.unit,
    quantity: r.quantity,
    unitPriceCentavos: r.unit_price_centavos,
    shippingFeeCentavos: r.shipping_fee_centavos,
    subtotalCentavos: r.subtotal_centavos,
    totalCentavos: r.total_centavos,
    downpaymentBps: r.downpayment_bps,
    downpaymentCentavos: r.downpayment_centavos,
    leadDays: r.lead_days,
    paymentTerms: r.payment_terms,
    conditions: r.conditions,
    validUntil: r.valid_until,
    createdAt: r.created_at,
  };
}

/** The signed-in user's chats, newest activity first, one page at a time. Null for visitors and admins. */
export async function loadChatInbox(before: InboxCursor | null = null): Promise<ChatList | null> {
  const user = await getSessionUser();
  if (!user || user.role === "admin") return null;
  const supabase = await createClient();
  const [rows, mine] = await Promise.all([
    supabase.rpc("chat_inbox", { p_before_at: before?.at, p_before_id: before?.id, p_limit: INBOX_PAGE + 1 }),
    supabase.rpc("my_supplier_id"),
  ]);
  if (rows.error) throw new Error(rows.error.message);
  if (mine.error) throw new Error(mine.error.message);
  const chats = rows.data.slice(0, INBOX_PAGE).map((r): ChatSummary => {
    const kind = r.kind === "rfq" ? "rfq" : "direct";
    const side = r.side === "supplier" ? "supplier" : "buyer";
    return {
      id: r.id,
      kind,
      side,
      name: r.name,
      subtitle: r.subtitle,
      conversationId: r.conversation_id ?? null,
      rfqId: r.rfq_id ?? null,
      supplierId: r.supplier_id,
      href: kind === "rfq" ? `/${side}/rfqs/${r.rfq_id}` : side === "buyer" ? `/suppliers/${r.supplier_id}` : null,
      closed: r.closed,
      unread: r.unread,
      lastAt: r.last_at ?? null,
      lastBody: r.last_body ?? null,
      negotiation: r.negotiation,
    };
  });
  return {
    viewerId: user.id,
    supplierId: mine.data ?? null,
    chats,
    hasMore: rows.data.length > INBOX_PAGE,
    loadedAt: new Date().toISOString(),
  };
}

/** Unread chats for the header badge (at most 100), or null when it cannot be read (signed out, network). */
export async function loadUnreadChatCount(): Promise<number | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("chat_unread_count");
  return error ? null : data;
}

type Supabase = Awaited<ReturnType<typeof createClient>>;
type DirectRow = Pick<
  Database["public"]["Tables"]["direct_messages"]["Row"],
  "id" | "sender_id" | "body" | "created_at" | "kind" | "payload" | "product_id"
>;
type ChatRef = { conversationId: string } | { rfqId: string; supplierId: string };

/** `<conversation id>` for a direct chat, `<rfq id>:<supplier id>` for an RFQ thread; null when malformed. */
function parseChatId(chatId: string): ChatRef | null {
  const [a, b, ...rest] = chatId.split(":");
  if (rest.length || !UUID.safeParse(a).success) return null;
  if (b === undefined) return { conversationId: a };
  return UUID.safeParse(b).success ? { rfqId: a, supplierId: b } : null;
}

function toDirectMessage(m: DirectRow): ChatMessage {
  return {
    id: String(m.id),
    senderId: m.sender_id,
    body: m.body,
    createdAt: m.created_at,
    rfq: m.kind === "rfq" ? toRfqCard(m.payload, m.product_id) : null,
    offerId: m.kind === "offer" ? offerPayload.parse(m.payload).offerId : null,
  };
}

/**
 * One page of a chat's messages, read newest first and returned oldest first. With `before`, the page that ends
 * just before that message. RLS leaves out rows the viewer may not see.
 */
async function messagePage(
  supabase: Supabase,
  chat: ChatRef,
  before: MessageCursor | null,
): Promise<{ messages: ChatMessage[]; hasOlder: boolean }> {
  // Quoted so the timestamp's "+" and ":" stay part of the value inside the filter.
  const older = before && `created_at.lt."${before.at}",and(created_at.eq."${before.at}",id.lt.${before.id})`;
  if ("conversationId" in chat) {
    let q = supabase
      .from("direct_messages")
      .select("id, sender_id, body, created_at, kind, payload, product_id")
      .eq("conversation_id", chat.conversationId);
    if (older) q = q.or(older);
    const { data, error } = await q.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(CHAT_PAGE + 1);
    if (error) throw new Error(error.message);
    return { messages: data.slice(0, CHAT_PAGE).reverse().map(toDirectMessage), hasOlder: data.length > CHAT_PAGE };
  }
  let q = supabase
    .from("rfq_messages")
    .select("id, sender_id, body, created_at")
    .eq("rfq_id", chat.rfqId)
    .eq("supplier_id", chat.supplierId);
  if (older) q = q.or(older);
  const { data, error } = await q.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(CHAT_PAGE + 1);
  if (error) throw new Error(error.message);
  const messages = data
    .slice(0, CHAT_PAGE)
    .reverse()
    .map((m): ChatMessage => ({ id: String(m.id), senderId: m.sender_id, body: m.body, createdAt: m.created_at, rfq: null, offerId: null }));
  return { messages, hasOlder: data.length > CHAT_PAGE };
}

/**
 * An open chat's newest messages with its offers, agreements and deal orders. Null when the id is malformed or
 * the direct conversation is not the viewer's.
 */
export async function loadChatThread(chatId: string): Promise<ChatThread | null> {
  const chat = parseChatId(chatId);
  if (!chat) return null;
  const supabase = await createClient();
  const loadedAt = new Date().toISOString();

  if (!("conversationId" in chat)) {
    const page = await messagePage(supabase, chat, null);
    // RFQ threads hold text messages only; offers and agreements belong to direct chats.
    return { ...page, offers: [], agreements: [], dealOrders: [], latestRfq: null, addresses: [], minDownpaymentTotalCentavos: 0, loadedAt };
  }

  const id = chat.conversationId;
  const [conversation, page, offerRows, agreementRows, latestRfqRow, settings, addresses] = await Promise.all([
    supabase.from("direct_conversations").select("id").eq("id", id).maybeSingle(),
    messagePage(supabase, chat, null),
    supabase.from("chat_offers").select("*").eq("conversation_id", id).order("seq"),
    supabase
      .from("deal_agreements")
      .select(
        "id, accept_id, version, return_class, terms_body, ship_to, created_at, deal_agreement_confirmations(party_id), orders(id, ref, status, payment_option, total_centavos, paid_online_centavos)",
      )
      .eq("conversation_id", id)
      .order("seq"),
    supabase
      .from("direct_messages")
      .select("payload, product_id")
      .eq("conversation_id", id)
      .eq("kind", "rfq")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle(),
    getNumberSettings(["downpayment_min_order_centavos"]),
    listMyAddresses(),
  ]);
  for (const r of [conversation, offerRows, agreementRows, latestRfqRow]) if (r.error) throw new Error(r.error.message);
  if (!conversation.data) return null;

  const agreements: Agreement[] = agreementRows.data!.map((g) => ({
    id: g.id,
    acceptId: g.accept_id,
    version: g.version,
    returnClass: g.return_class,
    termsBody: g.terms_body,
    shipTo: g.ship_to as ShipTo | null, // built by private.ship_to in the database
    confirmedBy: g.deal_agreement_confirmations.map((c) => c.party_id),
    createdAt: g.created_at,
  }));
  // RLS on orders still applies inside the embed: each party sees only the orders it may read.
  const dealOrders: DealOrder[] = agreementRows.data!.flatMap((g) =>
    g.orders.map((o) => ({
      id: o.id,
      ref: o.ref,
      agreementId: g.id,
      status: o.status,
      paymentOption: o.payment_option,
      totalCentavos: o.total_centavos,
      paidOnlineCentavos: o.paid_online_centavos,
    })),
  );
  const rfq = latestRfqRow.data;
  return {
    ...page,
    offers: offerRows.data!.map(toChatOffer),
    agreements,
    dealOrders,
    latestRfq: rfq ? toRfqCard(rfq.payload, rfq.product_id) : null,
    addresses,
    minDownpaymentTotalCentavos: settings.downpayment_min_order_centavos,
    loadedAt,
  };
}

/** The page of messages just before `before` (the oldest one on screen). Empty when the id is malformed. */
export async function loadOlderMessages(
  chatId: string,
  before: MessageCursor,
): Promise<{ messages: ChatMessage[]; hasOlder: boolean }> {
  const chat = parseChatId(chatId);
  if (!chat) return { messages: [], hasOlder: false };
  return messagePage(await createClient(), chat, before);
}

