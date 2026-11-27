import "server-only";
import { getSessionUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Claim, ClaimStatus, ClaimType, RefundStatus, Review } from "@/lib/types";

// Claims and reviews. RLS: buyers see their own claims, suppliers claims on their orders, support all.
// Reviews: visible ones are public; parties and support also see hidden ones.

function fail(error: { message: string }): never {
  throw new Error(error.message);
}

const CLAIM_COLUMNS =
  "*, orders(ref), suppliers(business_name, owner_id), claim_evidence(storage_path, file_name), claim_messages(id, sender_id, body, created_at), claim_status_history(to_status, note, created_at)" as const;

type ClaimRow = {
  id: string; ref: string; order_id: string; buyer_id: string; supplier_id: string; type: ClaimType; item_ids: string[];
  description: string; status: ClaimStatus; remedy: "refund" | "replacement" | null; refund_centavos: number;
  restocking_fee_centavos: number; manual_refund_centavos: number; manual_refund_ref: string; return_required: boolean;
  return_payer: "buyer" | "supplier" | null; ra_number: string | null; return_tracking_ref: string; return_received_at: string | null;
  response_note: string; decision_note: string; created_at: string; resolved_at: string | null;
  orders: { ref: string } | null; suppliers: { business_name: string; owner_id: string } | null;
  online_refund_id: string | null;
  claim_evidence: { storage_path: string; file_name: string }[];
  claim_messages: { id: number; sender_id: string; body: string; created_at: string }[];
  claim_status_history: { to_status: ClaimStatus; note: string; created_at: string }[];
};

function toClaim(c: ClaimRow, refund: Claim["onlineRefund"]): Claim {
  return {
    id: c.id, ref: c.ref, orderId: c.order_id, orderRef: c.orders?.ref ?? "", buyerId: c.buyer_id, supplierId: c.supplier_id,
    supplierName: c.suppliers?.business_name ?? "Supplier", supplierOwnerId: c.suppliers?.owner_id ?? "", type: c.type, itemIds: c.item_ids, description: c.description,
    status: c.status, remedy: c.remedy, refundCentavos: c.refund_centavos, restockingFeeCentavos: c.restocking_fee_centavos,
    onlineRefund: refund,
    manualRefundCentavos: c.manual_refund_centavos, manualRefundRef: c.manual_refund_ref, returnRequired: c.return_required,
    returnPayer: c.return_payer, raNumber: c.ra_number, returnTrackingRef: c.return_tracking_ref, returnReceivedAt: c.return_received_at,
    responseNote: c.response_note, decisionNote: c.decision_note, createdAt: c.created_at, resolvedAt: c.resolved_at,
    evidence: c.claim_evidence.map((e) => ({ storagePath: e.storage_path, fileName: e.file_name })),
    messages: [...c.claim_messages].sort((a, b) => a.id - b.id).map((m) => ({ id: String(m.id), senderId: m.sender_id, body: m.body, createdAt: m.created_at })),
    history: c.claim_status_history
      .map((h) => ({ toStatus: h.to_status, note: h.note, createdAt: h.created_at }))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
  };
}

/**
 * A claim's online refund is a group of rows (one per payment it was split over; reissues join the group). Returns one
 * amount (rows not failed-and-reissued) and the worst status: failed (nobody reissued) > pending > succeeded.
 */
async function onlineRefunds(supabase: Awaited<ReturnType<typeof createClient>>, claims: ClaimRow[]): Promise<Map<string, Claim["onlineRefund"]>> {
  const heads = [...new Set(claims.map((c) => c.online_refund_id).filter((h): h is string => !!h))];
  const out = new Map<string, Claim["onlineRefund"]>();
  if (!heads.length) return out;
  const list = heads.join(",");
  const { data, error } = await supabase.from("refunds").select("id, group_id, amount_centavos, status, reissue_of").or(`id.in.(${list}),group_id.in.(${list})`);
  if (error) fail(error);
  const reissued = new Set(data.map((r) => r.reissue_of).filter(Boolean));
  for (const head of heads) {
    const rows = data.filter((r) => (r.group_id ?? r.id) === head && !(r.status === "failed" && reissued.has(r.id)));
    if (!rows.length) continue;
    const status: RefundStatus = rows.some((r) => r.status === "failed") ? "failed" : rows.some((r) => r.status === "pending") ? "pending" : "succeeded";
    out.set(head, { amountCentavos: rows.reduce((t, r) => t + r.amount_centavos, 0), status });
  }
  return out;
}

/** Claims for one view, newest first. "buyer" = mine, "supplier" = on my orders, "admin" = all (support with MFA). */
export async function listClaims(view: "buyer" | "supplier" | "admin"): Promise<Claim[]> {
  const user = await getSessionUser();
  if (!user) return [];
  const supabase = await createClient();
  let q = supabase.from("claims").select(CLAIM_COLUMNS).order("created_at", { ascending: false });
  if (view === "buyer") q = q.eq("buyer_id", user.id);
  if (view === "supplier") {
    const { data: s } = await supabase.from("suppliers").select("id").eq("owner_id", user.id).maybeSingle();
    if (!s) return [];
    q = q.eq("supplier_id", s.id);
  }
  // shortcut: no paging yet; add range() once accounts have hundreds of claims.
  const { data, error } = await q;
  if (error) fail(error);
  const rows = data as unknown as ClaimRow[];
  const refunds = await onlineRefunds(supabase, rows);
  return rows.map((c) => toClaim(c, (c.online_refund_id && refunds.get(c.online_refund_id)) || null));
}

export async function getClaim(id: string): Promise<Claim | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.from("claims").select(CLAIM_COLUMNS).eq("id", id).maybeSingle();
  if (error) fail(error);
  if (!data) return null;
  const row = data as unknown as ClaimRow;
  return toClaim(row, (row.online_refund_id && (await onlineRefunds(supabase, [row])).get(row.online_refund_id)) || null);
}

/** Claims on one order (buyer's order page: is one open, can a new one be filed). */
export async function claimsForOrder(orderId: string): Promise<{ id: string; ref: string; type: ClaimType; status: ClaimStatus }[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("claims").select("id, ref, type, status").eq("order_id", orderId).order("created_at");
  if (error) fail(error);
  return data;
}

/** Report windows and the supplier's answer deadline (admin settings, in days). */
export async function claimSettings(): Promise<{
  damageDays: number;
  returnDays: number;
  defectDays: number;
  responseDays: number;
  /** Platform cap on restocking fees (basis points; 0 = off). */
  restockingFeeMaxBps: number;
}> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("platform_settings")
    .select("key, value")
    .in("key", ["report_window_damage_days", "report_window_return_days", "report_window_defect_days", "claim_response_days", "restocking_fee_max_bps"]);
  const n = (k: string, d: number) => {
    const v = data?.find((r) => r.key === k)?.value;
    return typeof v === "number" ? v : d;
  };
  return {
    damageDays: n("report_window_damage_days", 5),
    returnDays: n("report_window_return_days", 30),
    defectDays: n("report_window_defect_days", 60),
    responseDays: n("claim_response_days", 3),
    restockingFeeMaxBps: n("restocking_fee_max_bps", 0),
  };
}

// ---------------------------------------------------------------- reviews

type ReviewRow = {
  id: string; order_id: string; supplier_id: string; rating: number; body: string; supplier_reply: string;
  replied_at: string | null; hidden: boolean; hidden_reason: string; created_at: string;
};
const toReview = (r: ReviewRow): Review => ({
  id: r.id, orderId: r.order_id, supplierId: r.supplier_id, rating: r.rating, body: r.body, supplierReply: r.supplier_reply,
  repliedAt: r.replied_at, hidden: r.hidden, hiddenReason: r.hidden_reason, createdAt: r.created_at,
});

/** Visible reviews for a supplier's storefront, newest first, and the rating (null until a review exists). */
export async function supplierReviews(supplierId: string): Promise<{ rating: { average: number; count: number } | null; reviews: Review[] }> {
  const supabase = await createClient();
  const [{ data: rows, error }, { data: r }] = await Promise.all([
    supabase.from("public_reviews").select("*").eq("supplier_id", supplierId).order("created_at", { ascending: false }).limit(50),
    supabase.from("supplier_ratings").select("average_rating, review_count").eq("supplier_id", supplierId).maybeSingle(),
  ]);
  if (error) fail(error);
  return {
    rating: r && r.review_count ? { average: Number(r.average_rating), count: r.review_count ?? 0 } : null,
    // The public view leaves out the order and moderation fields; storefronts do not show them.
    reviews: rows.map((row) => ({
      id: row.id!, orderId: "", supplierId: row.supplier_id!, rating: row.rating!, body: row.body!, supplierReply: row.supplier_reply!,
      repliedAt: row.replied_at, hidden: false, hiddenReason: "", createdAt: row.created_at!,
    })),
  };
}

/** The buyer's review of one order, if any. */
export async function reviewForOrder(orderId: string): Promise<Review | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("reviews").select("*").eq("order_id", orderId).maybeSingle();
  return data ? toReview(data) : null;
}

/** Supplier: reviews of my business (including hidden ones, with the reason). Admin: all. */
export async function listReviews(view: "supplier" | "admin"): Promise<Review[]> {
  const user = await getSessionUser();
  if (!user) return [];
  const supabase = await createClient();
  let q = supabase.from("reviews").select("*").order("created_at", { ascending: false }).limit(200);
  if (view === "supplier") {
    const { data: s } = await supabase.from("suppliers").select("id").eq("owner_id", user.id).maybeSingle();
    if (!s) return [];
    q = q.eq("supplier_id", s.id);
  }
  const { data, error } = await q;
  if (error) fail(error);
  return data.map(toReview);
}

/** COD cash paid back directly, per order, from claims that count against the refund cap (refund_pending, resolved). RLS scopes the rows. */
export async function manualRefundsByOrder(): Promise<Record<string, number>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("claims")
    .select("order_id, manual_refund_centavos")
    .in("status", ["refund_pending", "resolved"])
    .gt("manual_refund_centavos", 0);
  if (error) fail(error);
  const out: Record<string, number> = {};
  for (const c of data) out[c.order_id] = (out[c.order_id] ?? 0) + c.manual_refund_centavos;
  return out;
}
