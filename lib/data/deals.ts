import "server-only";
import { cache } from "react";
import { getSessionUser, type UserRole } from "@/lib/auth";
import { SUPPLIER_COLUMNS, toSupplier } from "@/lib/data/catalog";
import { createClient } from "@/lib/supabase/server";
import type { Message, Notification, Offer, PriceTier, Quote, Rfq, RfqInvite, Selection, Supplier } from "@/lib/types";

// Everything about RFQs that the signed-in user may see, mapped onto the UI types. RLS does the
// scoping: buyers get their own requests, suppliers the ones they are invited to (never a competitor's
// quotes), support admins everything. Buyer contact details come back only for the buyer themselves,
// admins, and the supplier the buyer selected.

export type BuyerContact = { name: string; businessName: string; email: string; phone: string };
export type DealBundle = {
  viewer: { userId: string; role: UserRole; supplierId: string | null };
  rfqs: Rfq[];
  invites: RfqInvite[];
  quotes: Quote[];
  offers: Offer[];
  messages: Message[];
  selections: Selection[];
  notifications: Notification[];
  /** Suppliers named in the visible invites. */
  suppliers: Supplier[];
  /** Keyed by buyer id; missing = not revealed to this viewer. */
  buyers: Record<string, BuyerContact>;
};

function fail(error: { message: string }): never {
  throw new Error(error.message);
}

const EMPTY: Omit<DealBundle, "viewer"> = {
  rfqs: [], invites: [], quotes: [], offers: [], messages: [], selections: [], notifications: [], suppliers: [], buyers: {},
};

/** Once per request. Signed-out callers get an empty bundle. */
export const loadDeals = cache(async (): Promise<DealBundle> => {
  const user = await getSessionUser();
  if (!user) return { viewer: { userId: "", role: "buyer", supplierId: null }, ...EMPTY };
  const supabase = await createClient();

  // shortcut: loads every visible deal row for the viewer; page by RFQ once accounts have hundreds of requests.
  const [mine, rfqs, invites, quotes, offers, messages, selections, notifications] = await Promise.all([
    supabase.from("suppliers").select("id").eq("owner_id", user.id).maybeSingle(),
    supabase.from("rfqs").select("*, categories(slug)").order("created_at", { ascending: false }),
    supabase.from("rfq_invites").select("rfq_id, supplier_id, status"),
    supabase.from("quotes").select("*").order("created_at"),
    supabase.from("offers").select("*").order("seq"),
    supabase.from("rfq_messages").select("*").order("id"),
    supabase.from("selections").select("*"),
    supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(50),
  ]);
  for (const r of [mine, rfqs, invites, quotes, offers, messages, selections, notifications]) if (r.error) fail(r.error);

  const supplierIds = [...new Set(invites.data!.map((i) => i.supplier_id))];
  const buyerIds = [...new Set(rfqs.data!.map((r) => r.buyer_id))];
  const [sups, profiles] = await Promise.all([
    supplierIds.length ? supabase.from("suppliers").select(SUPPLIER_COLUMNS).in("id", supplierIds) : { data: [], error: null },
    buyerIds.length
      ? supabase.from("profiles").select("id, full_name, business_name, email, phone").in("id", buyerIds)
      : { data: [], error: null },
  ]);
  if (sups.error) fail(sups.error);
  if (profiles.error) fail(profiles.error);

  return {
    viewer: { userId: user.id, role: user.role, supplierId: mine.data?.id ?? null },
    rfqs: rfqs.data!.map((r) => ({
      id: r.id, ref: r.ref, buyerId: r.buyer_id, product: r.product, categorySlug: r.categories?.slug ?? "",
      description: r.description, specs: r.specs,
      quantity: r.quantity ?? 0, // 0 = not filled in yet (drafts only)
      unit: r.unit, city: r.city, province: r.province, requiredBy: r.required_by ?? "",
      budgetCentavos: r.budget_centavos, sharingConsent: r.sharing_consent, deliveryPreference: r.delivery_preference,
      needsBirInvoice: r.needs_bir_invoice, status: r.status, reviewNote: r.review_note, createdAt: r.created_at,
    })),
    invites: invites.data!.map((i) => ({ rfqId: i.rfq_id, supplierId: i.supplier_id, status: i.status })),
    quotes: quotes.data!.map((q) => ({
      id: q.id, ref: q.ref, rfqId: q.rfq_id, supplierId: q.supplier_id, revision: q.revision, quantity: q.quantity,
      unitPriceCentavos: q.unit_price_centavos, setupFeeCentavos: q.setup_fee_centavos, shippingFeeCentavos: q.shipping_fee_centavos,
      taxCentavos: q.tax_centavos, leadDays: q.lead_days, validUntil: q.valid_until, paymentTerms: q.payment_terms, notes: q.notes,
      createdAt: q.created_at, priceTiers: q.price_tiers as PriceTier[], deliveryTerms: q.delivery_terms, birInvoice: q.bir_invoice,
    })),
    offers: offers.data!.map((o) => ({
      id: o.id, rfqId: o.rfq_id, supplierId: o.supplier_id, quoteId: o.quote_id, actorId: o.actor_id, action: o.action,
      quantity: o.quantity, unitPriceCentavos: o.unit_price_centavos, leadDays: o.lead_days, paymentTerms: o.payment_terms,
      message: o.message, relatedOfferId: o.related_offer_id, createdAt: o.created_at,
    })),
    messages: messages.data!.map((m) => ({
      id: String(m.id), rfqId: m.rfq_id, supplierId: m.supplier_id, senderId: m.sender_id, body: m.body, createdAt: m.created_at,
    })),
    selections: selections.data!.map((s) => ({
      id: s.id, ref: s.ref, rfqId: s.rfq_id, buyerId: s.buyer_id, supplierId: s.supplier_id, quoteId: s.quote_id,
      amountCentavos: s.amount_centavos, amountIsEstimate: s.amount_is_estimate, status: "recorded" as const,
    })),
    notifications: notifications.data!.map((n) => ({
      id: String(n.id), userId: n.user_id, title: n.title, body: n.body, createdAt: n.created_at, link: n.link, readAt: n.read_at,
    })),
    suppliers: sups.data!.map(toSupplier),
    buyers: Object.fromEntries(
      profiles.data!.map((p) => [p.id, { name: p.full_name, businessName: p.business_name, email: p.email, phone: p.phone }]),
    ),
  };
});

/** Admin: verified suppliers matching an RFQ, best first. Empty without a support MFA session. */
export async function suggestSuppliers(rfqId: string): Promise<{ supplier: Supplier; score: number }[]> {
  const supabase = await createClient();
  const { data: ranked, error } = await supabase.rpc("admin_suggest_suppliers", { p_rfq_id: rfqId });
  if (error) return [];
  if (!ranked.length) return [];
  const { data, error: e2 } = await supabase.from("suppliers").select(SUPPLIER_COLUMNS).in("id", ranked.map((r) => r.supplier_id));
  if (e2) fail(e2);
  const byId = new Map(data.map((s) => [s.id, toSupplier(s)]));
  return ranked.flatMap((r) => (byId.has(r.supplier_id) ? [{ supplier: byId.get(r.supplier_id)!, score: r.score }] : []));
}
