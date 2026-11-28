import "server-only";
import { cache } from "react";
import { getSessionUser, type UserRole } from "@/lib/auth";
import { PAGE_SIZE, orValue, type ListParams, type Paged } from "@/lib/data/admin-money";
import { SUPPLIER_COLUMNS, toSupplier } from "@/lib/data/catalog";
import { createClient } from "@/lib/supabase/server";
import type { Message, Offer, PriceTier, Quote, Rfq, RfqInvite, Selection, Supplier } from "@/lib/types";

// RFQ deals for the signed-in user, mapped onto the UI types, a bounded set at a time: one RFQ (detail pages),
// the open RFQs (dashboards) or one page of a list. RLS does the scoping: buyers get their own requests,
// suppliers the ones they are invited to (never a competitor's quotes), support admins everything. Buyer
// contact details come back only for the buyer themselves, admins, and the supplier the buyer selected.

export type BuyerContact = { name: string; businessName: string; email: string; phone: string };
export type DealBundle = {
  viewer: { userId: string; role: UserRole; supplierId: string | null };
  rfqs: Rfq[];
  /** `createdAt` = when the invitation was sent (the waiting time counts from here). */
  invites: (RfqInvite & { createdAt?: string })[];
  quotes: Quote[];
  offers: Offer[];
  /** RFQ thread messages; only loadDeal (one RFQ) fills them. */
  messages: Message[];
  selections: Selection[];
  /** Suppliers named in the visible invites. */
  suppliers: Supplier[];
  /** Keyed by buyer id; missing = not revealed to this viewer. */
  buyers: Record<string, BuyerContact>;
};

// Every rfqs column the API may read (review_note is withheld; see rfq_review_notes).
// One literal so the typed client can parse it.
const RFQ_COLUMNS =
  "id, ref, buyer_id, product, category_id, description, specs, quantity, unit, city, province, required_by, budget_centavos, sharing_consent, delivery_preference, needs_bir_invoice, status, idempotency_key, submitted_at, created_at, updated_at, public_board, categories(slug)" as const;

/** Statuses before a supplier is selected (pipelineStage maps the rest to "closed"). */
const OPEN_RFQ_STATUSES = ["draft", "under_review", "needs_information", "matching", "invited", "quoting"] as const;
/** Closed RFQs a dashboard shows besides the open ones; the RFQ list pages the rest. */
const RECENT_CLOSED = 10;

function fail(error: { message: string }): never {
  throw new Error(error.message);
}

type Supabase = Awaited<ReturnType<typeof createClient>>;
type Viewer = DealBundle["viewer"];
type RfqRow = {
  id: string; ref: string; buyer_id: string; product: string; description: string; specs: string; quantity: number | null;
  unit: Rfq["unit"]; city: string; province: string; required_by: string | null; budget_centavos: number | null;
  sharing_consent: boolean; public_board: boolean; delivery_preference: Rfq["deliveryPreference"]; needs_bir_invoice: boolean;
  status: Rfq["status"]; created_at: string; categories: { slug: string } | null;
};

const empty = (viewer: Viewer): DealBundle => ({
  viewer, rfqs: [], invites: [], quotes: [], offers: [], messages: [], selections: [], suppliers: [], buyers: {},
});

/** The session, its client and the viewer's own supplier id; null when signed out. Once per request. */
const viewerOf = cache(async (): Promise<{ supabase: Supabase; viewer: Viewer } | null> => {
  const user = await getSessionUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.from("suppliers").select("id").eq("owner_id", user.id).maybeSingle();
  if (error) fail(error);
  return { supabase, viewer: { userId: user.id, role: user.role, supplierId: data?.id ?? null } };
});

const SIGNED_OUT: Viewer = { userId: "", role: "buyer", supplierId: null };

/** Everything about the given RFQs (already read and in display order): invites, quotes, offers, selections, names. */
async function bundleFor(supabase: Supabase, viewer: Viewer, rfqRows: RfqRow[], withMessages: boolean): Promise<DealBundle> {
  if (rfqRows.length === 0) return empty(viewer);
  const ids = rfqRows.map((r) => r.id);
  const [invites, quotes, offers, messages, selections, notes] = await Promise.all([
    supabase.from("rfq_invites").select("rfq_id, supplier_id, status, created_at").in("rfq_id", ids),
    supabase.from("quotes").select("*").in("rfq_id", ids).order("created_at"),
    supabase.from("offers").select("*").in("rfq_id", ids).order("seq"),
    withMessages ? supabase.from("rfq_messages").select("*").in("rfq_id", ids).order("id") : { data: [], error: null },
    supabase.from("selections").select("*").in("rfq_id", ids),
    // The review note is not readable from the table; this returns it only for the buyer's own RFQs (or support).
    supabase.rpc("rfq_review_notes", { p_ids: ids }),
  ]);
  for (const r of [invites, quotes, offers, messages, selections, notes]) if (r.error) fail(r.error);
  const noteFor = new Map((notes.data ?? []).map((n) => [n.rfq_id, n.note]));

  const supplierIds = [...new Set(invites.data!.map((i) => i.supplier_id))];
  const buyerIds = [...new Set(rfqRows.map((r) => r.buyer_id))];
  const [sups, profiles] = await Promise.all([
    supplierIds.length ? supabase.from("suppliers").select(SUPPLIER_COLUMNS).in("id", supplierIds) : { data: [], error: null },
    supabase.from("profiles").select("id, full_name, business_name, email, phone").in("id", buyerIds),
  ]);
  if (sups.error) fail(sups.error);
  if (profiles.error) fail(profiles.error);

  return {
    viewer,
    rfqs: rfqRows.map((r) => ({
      id: r.id, ref: r.ref, buyerId: r.buyer_id, product: r.product, categorySlug: r.categories?.slug ?? "",
      description: r.description, specs: r.specs,
      quantity: r.quantity ?? 0, // 0 = not filled in yet (drafts only)
      unit: r.unit, city: r.city, province: r.province, requiredBy: r.required_by ?? "",
      budgetCentavos: r.budget_centavos, sharingConsent: r.sharing_consent, publicBoard: r.public_board, deliveryPreference: r.delivery_preference,
      needsBirInvoice: r.needs_bir_invoice, status: r.status, reviewNote: noteFor.get(r.id) ?? "", createdAt: r.created_at,
    })),
    invites: invites.data!.map((i) => ({ rfqId: i.rfq_id, supplierId: i.supplier_id, status: i.status, createdAt: i.created_at })),
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
    suppliers: sups.data!.map(toSupplier),
    buyers: Object.fromEntries(
      profiles.data!.map((p) => [p.id, { name: p.full_name, businessName: p.business_name, email: p.email, phone: p.phone }]),
    ),
  };
}

/** RFQ rows by id, in the order of `ids` (ids the viewer may not see are dropped). */
async function rfqsByIds(supabase: Supabase, ids: string[]): Promise<RfqRow[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase.from("rfqs").select(RFQ_COLUMNS).in("id", ids);
  if (error) fail(error);
  const byId = new Map(data.map((r) => [r.id, r]));
  return [...new Set(ids)].flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One RFQ with everything about it, including its message threads. Empty when it is not visible. Once per request. */
export const loadDeal = cache(async (rfqId: string): Promise<DealBundle> => {
  const v = await viewerOf();
  if (!v) return empty(SIGNED_OUT);
  if (!UUID.test(rfqId)) return empty(v.viewer);
  return bundleFor(v.supabase, v.viewer, await rfqsByIds(v.supabase, [rfqId]), true);
});

/** Dashboards: every open RFQ the viewer can see, newest first, then the most recent closed ones. No messages. */
export const loadDashboardDeals = cache(async (): Promise<DealBundle> => {
  const v = await viewerOf();
  if (!v) return empty(SIGNED_OUT);
  const open = `(${OPEN_RFQ_STATUSES.join(",")})`;
  const [openRows, closedRows] = await Promise.all([
    v.supabase.from("rfqs").select(RFQ_COLUMNS).filter("status", "in", open).order("created_at", { ascending: false }),
    v.supabase.from("rfqs").select(RFQ_COLUMNS).not("status", "in", open).order("created_at", { ascending: false }).limit(RECENT_CLOSED),
  ]);
  if (openRows.error) fail(openRows.error);
  if (closedRows.error) fail(closedRows.error);
  return bundleFor(v.supabase, v.viewer, [...openRows.data, ...closedRows.data], false);
});

export type DealListView = "buyer_rfqs" | "supplier_invites" | "supplier_quotes" | "admin_rfqs" | "admin_selections";

const range = (page: number) => [(page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1] as const;
const paged = (rows: string[], total: number | null, page: number, perPage = total): Paged<string> => ({
  rows,
  total: total ?? 0,
  page,
  pages: Math.max(1, Math.ceil((perPage ?? 0) / PAGE_SIZE)),
});

/**
 * One page (PAGE_SIZE rows) of a deal list, newest first, with the deals behind it (no messages).
 * `paged.rows` are the page's row ids in display order: RFQ ids for buyer_rfqs, supplier_invites and admin_rfqs,
 * quote ids for supplier_quotes, selection ids for admin_selections. admin_rfqs filters on params.status and
 * params.q (ref or product); without a status filter, page 1 starts with every RFQ waiting for review.
 */
export async function loadDealPage(view: DealListView, params: ListParams): Promise<{ deals: DealBundle; paged: Paged<string> }> {
  const v = await viewerOf();
  if (!v) return { deals: empty(SIGNED_OUT), paged: paged([], 0, 1) };
  const { supabase, viewer } = v;
  const [from, to] = range(params.page);

  if (view === "buyer_rfqs" || view === "admin_rfqs") {
    let q = supabase.from("rfqs").select(RFQ_COLUMNS, { count: "exact" });
    let review: RfqRow[] = [];
    if (view === "buyer_rfqs") {
      q = q.eq("buyer_id", viewer.userId);
    } else {
      // Drafts stay with the buyer until they submit.
      q = q.neq("status", "draft");
      const like = params.q ? orValue(`%${params.q}%`) : null;
      if (like) q = q.or(`ref.ilike.${like},product.ilike.${like}`);
      if (params.status) {
        q = q.eq("status", params.status as Rfq["status"]);
      } else {
        // The review queue first: unpaged, it is bounded by the review workload.
        q = q.neq("status", "under_review");
        if (params.page === 1) {
          let r = supabase.from("rfqs").select(RFQ_COLUMNS).eq("status", "under_review");
          if (like) r = r.or(`ref.ilike.${like},product.ilike.${like}`);
          const res = await r.order("created_at", { ascending: false });
          if (res.error) fail(res.error);
          review = res.data;
        }
      }
    }
    const { data, count, error } = await q.order("created_at", { ascending: false }).range(from, to);
    if (error) fail(error);
    const rows = [...review, ...data];
    return {
      deals: await bundleFor(supabase, viewer, rows, false),
      paged: paged(rows.map((r) => r.id), (count ?? 0) + review.length, params.page, count),
    };
  }

  if (view === "supplier_invites") {
    if (!viewer.supplierId) return { deals: empty(viewer), paged: paged([], 0, 1) };
    const { data, count, error } = await supabase
      .from("rfq_invites")
      .select("rfq_id", { count: "exact" })
      .eq("supplier_id", viewer.supplierId)
      .order("created_at", { ascending: false })
      .range(from, to);
    if (error) fail(error);
    const ids = data.map((i) => i.rfq_id);
    return { deals: await bundleFor(supabase, viewer, await rfqsByIds(supabase, ids), false), paged: paged(ids, count, params.page) };
  }

  if (view === "supplier_quotes") {
    if (!viewer.supplierId) return { deals: empty(viewer), paged: paged([], 0, 1) };
    const { data, count, error } = await supabase
      .from("quotes")
      .select("id, rfq_id", { count: "exact" })
      .eq("supplier_id", viewer.supplierId)
      .order("created_at", { ascending: false })
      .range(from, to);
    if (error) fail(error);
    const deals = await bundleFor(supabase, viewer, await rfqsByIds(supabase, data.map((q) => q.rfq_id)), false);
    return { deals, paged: paged(data.map((q) => q.id), count, params.page) };
  }

  // admin_selections
  const { data, count, error } = await supabase
    .from("selections")
    .select("id, rfq_id", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);
  if (error) fail(error);
  const deals = await bundleFor(supabase, viewer, await rfqsByIds(supabase, data.map((s) => s.rfq_id)), false);
  return { deals, paged: paged(data.map((s) => s.id), count, params.page) };
}

/** All-time counts for the dashboard tiles (public.deal_counts), on the viewer's buying and selling side. */
export type DealCounts = {
  buyerRfqs: number;
  buyerOpenRfqs: number;
  /** Every quote revision on the buyer's RFQs. */
  buyerQuotes: number;
  /** One per RFQ and supplier (the latest revision). */
  buyerLatestQuotes: number;
  buyerSelections: number;
  supplierInvites: number;
  supplierQuotes: number;
  supplierSelections: number;
};

const ZERO: DealCounts = {
  buyerRfqs: 0, buyerOpenRfqs: 0, buyerQuotes: 0, buyerLatestQuotes: 0, buyerSelections: 0,
  supplierInvites: 0, supplierQuotes: 0, supplierSelections: 0,
};

/** Once per request; zeros when signed out. */
export const getDealCounts = cache(async (): Promise<DealCounts> => {
  const v = await viewerOf();
  if (!v) return ZERO;
  const { data, error } = await v.supabase.rpc("deal_counts");
  if (error) fail(error);
  const n = (data ?? {}) as Record<string, number>;
  return {
    buyerRfqs: n.buyer_rfqs ?? 0,
    buyerOpenRfqs: n.buyer_open_rfqs ?? 0,
    buyerQuotes: n.buyer_quotes ?? 0,
    buyerLatestQuotes: n.buyer_latest_quotes ?? 0,
    buyerSelections: n.buyer_selections ?? 0,
    supplierInvites: n.supplier_invites ?? 0,
    supplierQuotes: n.supplier_quotes ?? 0,
    supplierSelections: n.supplier_selections ?? 0,
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
