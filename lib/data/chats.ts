import "server-only";
import { getSessionUser } from "@/lib/auth";
import { z } from "zod";
import { isUnread, rfqChat, sortChats, type Chat, type ChatList, type OpenChatDetail, type RfqCard } from "@/lib/chats";
import { getProduct } from "@/lib/data/catalog";
import { getNumberSettings } from "@/lib/data/settings";
import type { Agreement, DealOrder } from "@/lib/agreements";
import { listMyAddresses } from "@/lib/data/orders";
import type { ChatOffer } from "@/lib/offers";
import type { ShipTo } from "@/lib/types";
import type { Database } from "@/lib/supabase/database.types";
import { loadDeals } from "@/lib/data/deals";
import { createClient } from "@/lib/supabase/server";
import { buildThreads } from "@/lib/threads";

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

/** Every chat the signed-in user is part of, on both their buying and selling side. Null for visitors and admins. */
export async function loadChats(): Promise<ChatList | null> {
  const user = await getSessionUser();
  if (!user || user.role === "admin") return null;
  const deals = await loadDeals();
  const { userId, supplierId } = deals.viewer;
  const supabase = await createClient();

  // shortcut: loads full history on each refresh; page messages per chat once accounts hold thousands.
  const [conversations, messages, reads, offerRows, agreementRows, confirmRows, orderRows, settings, addresses] = await Promise.all([
    supabase.from("direct_conversations").select("id, buyer_id, supplier_id, buyer_name, last_message_at"),
    supabase.from("direct_messages").select("id, conversation_id, sender_id, body, created_at, kind, payload, product_id").order("id"),
    supabase.from("chat_reads").select("thread_id, last_read_at"),
    supabase.from("chat_offers").select("*").order("seq"),
    supabase.from("deal_agreements").select("id, conversation_id, accept_id, version, return_class, terms_body, ship_to, created_at").order("seq"),
    supabase.from("deal_agreement_confirmations").select("agreement_id, party_id"),
    supabase
      .from("orders")
      .select("id, ref, agreement_id, status, payment_option, total_centavos, paid_online_centavos")
      .not("agreement_id", "is", null),
    getNumberSettings(["downpayment_min_order_centavos"]),
    listMyAddresses(),
  ]);
  for (const r of [conversations, messages, reads, offerRows, agreementRows, confirmRows, orderRows]) if (r.error) throw new Error(r.error.message);
  const confirmedBy = (id: string) => confirmRows.data!.filter((r) => r.agreement_id === id).map((r) => r.party_id);
  const agreements = agreementRows.data!.map((g) => ({
    conversationId: g.conversation_id,
    agreement: {
      id: g.id,
      acceptId: g.accept_id,
      version: g.version,
      returnClass: g.return_class,
      termsBody: g.terms_body,
      shipTo: g.ship_to as ShipTo | null, // built by private.ship_to in the database
      confirmedBy: confirmedBy(g.id),
      createdAt: g.created_at,
    } satisfies Agreement,
  }));
  const dealOrders: DealOrder[] = orderRows.data!.map((o) => ({
    id: o.id,
    ref: o.ref,
    agreementId: o.agreement_id!, // filtered on not null above
    status: o.status,
    paymentOption: o.payment_option,
    totalCentavos: o.total_centavos,
    paidOnlineCentavos: o.paid_online_centavos,
  }));

  const readAt = new Map(reads.data!.map((r) => [r.thread_id, r.last_read_at]));
  const supplierIds = [...new Set(conversations.data!.map((c) => c.supplier_id))];
  const names = supplierIds.length
    ? await supabase.from("suppliers").select("id, business_name").in("id", supplierIds)
    : { data: [], error: null };
  if (names.error) throw new Error(names.error.message);
  const supplierName = new Map(names.data!.map((s) => [s.id, s.business_name]));

  const direct: Chat[] = conversations.data!.map((c) => {
    const side = c.buyer_id === userId ? "buyer" : "supplier";
    const thread = messages.data!
      .filter((m) => m.conversation_id === c.id)
      .map((m) => ({
        id: String(m.id),
        senderId: m.sender_id,
        body: m.body,
        createdAt: m.created_at,
        rfq: m.kind === "rfq" ? toRfqCard(m.payload, m.product_id) : null,
        offerId: m.kind === "offer" ? offerPayload.parse(m.payload).offerId : null,
      }));
    return {
      id: c.id,
      kind: "direct",
      side,
      name: side === "buyer" ? (supplierName.get(c.supplier_id) ?? "Supplier") : c.buyer_name,
      subtitle: "",
      conversationId: c.id,
      rfqId: null,
      supplierId: c.supplier_id,
      href: side === "buyer" ? `/suppliers/${c.supplier_id}` : null,
      closed: false,
      unread: isUnread(thread, userId, readAt.get(c.id)),
      lastAt: thread.at(-1)?.createdAt ?? c.last_message_at,
      messages: thread,
      offers: offerRows.data!.filter((r) => r.conversation_id === c.id).map(toChatOffer),
      agreements: agreements.filter((g) => g.conversationId === c.id).map((g) => g.agreement),
      dealOrders: dealOrders.filter((o) => agreements.some((g) => g.conversationId === c.id && g.agreement.id === o.agreementId)),
    };
  });

  const viewer = { userId, supplierId };
  const rfq = [
    ...buildThreads(deals, "buyer", viewer).map((t) => rfqChat(t, "buyer", userId, readAt.get(t.id))),
    ...(supplierId ? buildThreads(deals, "supplier", viewer) : []).map((t) => rfqChat(t, "supplier", userId, readAt.get(t.id))),
  ];
  const seen = new Set<string>();
  const chats = sortChats([...direct, ...rfq]).filter((c) => !seen.has(c.id) && seen.add(c.id));
  return {
    viewerId: userId,
    supplierId,
    chats,
    minDownpaymentTotalCentavos: settings.downpayment_min_order_centavos,
    loadedAt: new Date().toISOString(),
    addresses,
  };
}
