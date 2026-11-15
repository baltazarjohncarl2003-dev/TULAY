import "server-only";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

// Admin money and order lists: search, status filter and paging done in the database (RLS scopes the rows).
// Money stays integer centavos; amounts here are for display only, the database decides.

type Enums = Database["public"]["Enums"];

export const PAGE_SIZE = 50;

function fail(error: { message: string }): never {
  throw new Error(error.message);
}

export type ListParams = { q: string; status: string; page: number };
export type Paged<T> = { rows: T[]; total: number; page: number; pages: number };

const paramsSchema = z.object({
  q: z.string().trim().max(80).catch(""),
  status: z.string().trim().max(40).catch(""),
  page: z.coerce.number().int().min(1).max(100000).catch(1),
});

/** Reads ?q=&status=&page= from a page's searchParams. Unknown statuses are dropped. */
export function parseListParams(sp: Record<string, string | string[] | undefined>, statuses: readonly string[]): ListParams {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const p = paramsSchema.parse({ q: one(sp.q) ?? "", status: one(sp.status) ?? "", page: one(sp.page) ?? 1 });
  // Letters, digits and a few separators only, so the text is safe inside a PostgREST filter.
  return { q: p.q.replace(/[^\p{L}\p{N}@._\- ]/gu, ""), status: statuses.includes(p.status) ? p.status : "", page: p.page };
}

const range = (page: number) => [(page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1] as const;
const paged = <T>(rows: T[], total: number | null, page: number): Paged<T> => ({
  rows,
  total: total ?? 0,
  page,
  pages: Math.max(1, Math.ceil((total ?? 0) / PAGE_SIZE)),
});
const inList = (ids: string[]) => `(${ids.join(",")})`;

/** Ids of orders whose ref matches, for searches that start from another table. */
async function orderIdsByRef(q: string): Promise<{ id: string; checkout_id: string }[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("orders").select("id, checkout_id").ilike("ref", `%${q}%`).limit(50);
  return data ?? [];
}

// ---------------------------------------------------------------- orders

export const ORDER_STATUSES = ["pending_payment", "paid", "confirmed", "in_production", "shipped", "delivered", "completed", "cancelled"] as const;

export type AdminOrderRow = {
  id: string; ref: string; supplierName: string; status: Enums["order_status"]; totalCentavos: number; commissionCentavos: number;
  gatewayFeeCentavos: number; paidOnlineCentavos: number; refundedCentavos: number; paidAt: string | null;
  /** Most that can still be refunded: paid online minus non-failed refunds (the database caps at the same). */
  refundableCentavos: number;
};

export async function listAdminOrders(p: ListParams): Promise<Paged<AdminOrderRow>> {
  const supabase = await createClient();
  const [from, to] = range(p.page);
  let query = supabase
    .from("orders")
    .select(
      "id, ref, status, total_centavos, commission_centavos, gateway_fee_centavos, paid_online_centavos, paid_at, suppliers(business_name), refunds(amount_centavos, status)",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(from, to);
  if (p.status) query = query.eq("status", p.status as Enums["order_status"]);
  if (p.q) {
    const like = `%${p.q}%`;
    const [buyers, pays, sups] = await Promise.all([
      supabase.from("profiles").select("id").ilike("email", like).limit(50),
      supabase.from("payments").select("checkout_id").ilike("provider_ref", like).limit(50),
      supabase.from("suppliers").select("id").ilike("business_name", like).limit(50),
    ]);
    const parts = [`ref.ilike.${like}`];
    if (buyers.data?.length) parts.push(`buyer_id.in.${inList(buyers.data.map((b) => b.id))}`);
    if (pays.data?.length) parts.push(`checkout_id.in.${inList(pays.data.map((x) => x.checkout_id))}`);
    if (sups.data?.length) parts.push(`supplier_id.in.${inList(sups.data.map((s) => s.id))}`);
    query = query.or(parts.join(","));
  }
  const { data, error, count } = await query;
  if (error) fail(error);
  const rows = data.map((o) => {
    const refunded = o.refunds.reduce((sum, r) => (r.status === "failed" ? sum : sum + r.amount_centavos), 0);
    return {
      id: o.id, ref: o.ref, supplierName: o.suppliers?.business_name ?? "Supplier", status: o.status, totalCentavos: o.total_centavos,
      commissionCentavos: o.commission_centavos, gatewayFeeCentavos: o.gateway_fee_centavos, paidOnlineCentavos: o.paid_online_centavos,
      refundedCentavos: refunded, paidAt: o.paid_at, refundableCentavos: Math.max(0, o.paid_online_centavos - refunded),
    };
  });
  return paged(rows, count, p.page);
}

// ---------------------------------------------------------------- payments and refunds

export const PAYMENT_STATUSES = ["pending", "paid", "failed", "expired", "needs_review"] as const;

export type AdminPaymentRow = {
  id: string; createdAt: string; method: string; amountCentavos: number; feeCentavos: number | null; status: Enums["payment_status"];
  providerRef: string | null; paidAt: string | null; orders: { id: string; ref: string }[];
  /** The non-failed refund of an unmatched payment, if any: the payment is then resolved. */
  unmatchedRefund: { status: Enums["refund_status"] } | null;
};

export async function listAdminPayments(p: ListParams): Promise<Paged<AdminPaymentRow>> {
  const supabase = await createClient();
  const [from, to] = range(p.page);
  let query = supabase
    .from("payments")
    .select("id, amount_centavos, fee_centavos, method, status, provider_ref, paid_at, created_at, checkouts(orders(id, ref)), refunds(status, order_id)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);
  if (p.status) query = query.eq("status", p.status as Enums["payment_status"]);
  if (p.q) {
    const byRef = await orderIdsByRef(p.q);
    const parts = [`provider_ref.ilike.%${p.q}%`];
    if (byRef.length) parts.push(`checkout_id.in.${inList(byRef.map((o) => o.checkout_id))}`);
    query = query.or(parts.join(","));
  }
  const { data, error, count } = await query;
  if (error) fail(error);
  const rows = data.map((x) => ({
    id: x.id, createdAt: x.created_at, method: x.method, amountCentavos: x.amount_centavos, feeCentavos: x.fee_centavos, status: x.status,
    providerRef: x.provider_ref, paidAt: x.paid_at, orders: x.checkouts?.orders ?? [],
    unmatchedRefund: x.refunds.find((r) => r.order_id === null && r.status !== "failed") ?? null,
  }));
  return paged(rows, count, p.page);
}

/** Payments that matched no open checkout and have no live refund yet (the only ones that need action). */
export async function openUnmatchedCount(): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payments")
    .select("id, refunds(status, order_id)")
    .eq("status", "needs_review")
    .limit(1000); // shortcut: counts the first 1,000 flagged payments, enough while there are only a few.
  if (error) fail(error);
  return data.filter((x) => !x.refunds.some((r) => r.order_id === null && r.status !== "failed")).length;
}

export type AdminRefundRow = {
  id: string; createdAt: string; orderId: string | null; orderRef: string | null; amountCentavos: number;
  status: Enums["refund_status"]; reason: string;
  /** Failed and not yet sent again (mirrors admin_reissue_refund's own check). */
  canReissue: boolean;
};

const REFUND_COLUMNS = "id, amount_centavos, status, reason, created_at, order_id, payment_id, orders(id, ref)" as const;

/** Refunds finance still has to act on: pending ones (retry) and failed ones not yet re-sent. */
export async function listRefundsNeedingAction(): Promise<AdminRefundRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("refunds")
    .select(REFUND_COLUMNS)
    .in("status", ["pending", "failed"])
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) fail(error);
  const failed = data.filter((r) => r.status === "failed");
  const later = failed.length
    ? ((await supabase.from("refunds").select("payment_id, order_id, amount_centavos, reason, created_at").in("payment_id", failed.map((r) => r.payment_id)).neq("status", "failed")).data ?? [])
    : [];
  return data
    .map((r) => ({
      id: r.id, createdAt: r.created_at, orderId: r.orders?.id ?? null, orderRef: r.orders?.ref ?? null, amountCentavos: r.amount_centavos,
      status: r.status, reason: r.reason,
      canReissue:
        r.status === "failed" &&
        !later.some((l) => l.payment_id === r.payment_id && l.order_id === r.order_id && l.amount_centavos === r.amount_centavos && l.reason === r.reason && l.created_at > r.created_at),
    }))
    .filter((r) => r.status === "pending" || r.canReissue);
}

/** Settled refunds, newest first, paged by `rpage`. */
export async function listRefundHistory(page: number): Promise<Paged<AdminRefundRow>> {
  const supabase = await createClient();
  const [from, to] = range(page);
  const { data, error, count } = await supabase
    .from("refunds")
    .select(REFUND_COLUMNS, { count: "exact" })
    .eq("status", "succeeded")
    .order("created_at", { ascending: false })
    .range(from, to);
  if (error) fail(error);
  const rows = data.map((r) => ({
    id: r.id, createdAt: r.created_at, orderId: r.orders?.id ?? null, orderRef: r.orders?.ref ?? null, amountCentavos: r.amount_centavos,
    status: r.status, reason: r.reason, canReissue: false,
  }));
  return paged(rows, count, page);
}

// ---------------------------------------------------------------- payouts

export const PAYOUT_STATUSES = ["scheduled", "released"] as const;

// A claim in any of these still ties up the order's money.
const CLOSED_CLAIMS = ["declined", "resolved", "cancelled"];

export type AdminPayoutRow = {
  id: string; ref: string; amountCentavos: number; status: Enums["payout_status"]; scheduledAt: string; releasedAt: string | null;
  supplierName: string; orders: { id: string; ref: string }[];
  /** Plain-text cautions shown before releasing. */
  warnings: string[];
};

export async function listAdminPayouts(p: ListParams): Promise<Paged<AdminPayoutRow>> {
  const supabase = await createClient();
  const [from, to] = range(p.page);
  let query = supabase
    .from("payouts")
    .select("id, ref, amount_centavos, status, scheduled_at, released_at, suppliers(business_name, status), payout_items(orders(id, ref))", { count: "exact" })
    .order("scheduled_at", { ascending: false })
    .range(from, to);
  if (p.status) query = query.eq("status", p.status as Enums["payout_status"]);
  if (p.q) {
    const { data: sups } = await supabase.from("suppliers").select("id").ilike("business_name", `%${p.q}%`).limit(50);
    const parts = [`ref.ilike.%${p.q}%`];
    if (sups?.length) parts.push(`supplier_id.in.${inList(sups.map((s) => s.id))}`);
    query = query.or(parts.join(","));
  }
  const { data, error, count } = await query;
  if (error) fail(error);

  // Open claims on the orders of payouts still to be released.
  const orderIds = [...new Set(data.filter((x) => x.status === "scheduled").flatMap((x) => x.payout_items.flatMap((i) => (i.orders ? [i.orders.id] : []))))];
  const claimed = new Set<string>();
  if (orderIds.length) {
    const { data: cl } = await supabase.from("claims").select("order_id, status").in("order_id", orderIds);
    for (const c of cl ?? []) if (!CLOSED_CLAIMS.includes(c.status)) claimed.add(c.order_id);
  }

  const rows = data.map((x) => {
    const orders = x.payout_items.flatMap((i) => (i.orders ? [i.orders] : []));
    const name = x.suppliers?.business_name ?? "Unknown supplier";
    const warnings: string[] = [];
    if (x.suppliers && x.suppliers.status !== "verified") warnings.push(`${name} is ${x.suppliers.status}, not verified.`);
    for (const o of orders) if (claimed.has(o.id)) warnings.push(`Order ${o.ref} has an open claim.`);
    return {
      id: x.id, ref: x.ref, amountCentavos: x.amount_centavos, status: x.status, scheduledAt: x.scheduled_at, releasedAt: x.released_at,
      supplierName: name, orders, warnings,
    };
  });
  return paged(rows, count, p.page);
}

// ---------------------------------------------------------------- ledger

export const LEDGER_ACCOUNTS = ["gateway_clearing", "supplier_payable", "platform_revenue", "unmatched_payments"] as const;

/** Gateway clearing is an asset (debits add to it); the others are liabilities or income (credits add). */
export const DEBIT_NORMAL: readonly string[] = ["gateway_clearing"];

export function displayBalance(account: string, creditMinusDebit: number): number {
  return DEBIT_NORMAL.includes(account) ? -creditMinusDebit : creditMinusDebit;
}

export type LedgerRow = {
  id: number; createdAt: string; account: string; debit: number; credit: number; memo: string;
  order: { id: string; ref: string } | null; supplierName: string | null;
};

export async function adminLedger(p: ListParams): Promise<{ balances: Record<string, number>; entries: Paged<LedgerRow> }> {
  const supabase = await createClient();
  const [from, to] = range(p.page);
  let query = supabase
    .from("ledger_entries")
    .select("id, account, debit_centavos, credit_centavos, memo, created_at, orders(id, ref), suppliers(business_name)", { count: "exact" })
    .order("id", { ascending: false })
    .range(from, to);
  if (p.status) query = query.eq("account", p.status as Enums["ledger_account"]);
  if (p.q) {
    const [byRef, sups] = await Promise.all([
      orderIdsByRef(p.q),
      supabase.from("suppliers").select("id").ilike("business_name", `%${p.q}%`).limit(50),
    ]);
    const parts = ["memo.ilike.%" + p.q + "%"];
    if (byRef.length) parts.push(`order_id.in.${inList(byRef.map((o) => o.id))}`);
    if (sups.data?.length) parts.push(`supplier_id.in.${inList(sups.data.map((s) => s.id))}`);
    query = query.or(parts.join(","));
  }
  const [{ data, error, count }, sums] = await Promise.all([query, supabase.from("ledger_balances").select("account, balance_centavos")]);
  if (error) fail(error);
  if (sums.error) fail(sums.error);
  const balances: Record<string, number> = {};
  for (const s of sums.data) if (s.account) balances[s.account] = (balances[s.account] ?? 0) + (s.balance_centavos ?? 0);
  for (const a of Object.keys(balances)) balances[a] = displayBalance(a, balances[a]);
  const rows = data.map((e) => ({
    id: e.id, createdAt: e.created_at, account: e.account, debit: e.debit_centavos, credit: e.credit_centavos, memo: e.memo,
    order: e.orders, supplierName: e.suppliers?.business_name ?? null,
  }));
  return { balances, entries: paged(rows, count, p.page) };
}

// ---------------------------------------------------------------- shipments

const PROBLEM_SHIPMENTS: Enums["shipment_status"][] = ["returned", "failed_attempt"];
export const SHIPMENT_FILTERS = ["problem", "booked", "picked_up", "in_transit", "out_for_delivery", "delivered", "failed_attempt", "returned"] as const;

export type AdminShipmentRow = {
  id: string; carrier: string; trackingRef: string; status: Enums["shipment_status"]; codCentavos: number; updatedAt: string;
  order: { id: string; ref: string } | null; supplierName: string | null;
};

const SHIPMENT_COLUMNS = "id, carrier, tracking_ref, status, cod_amount_centavos, updated_at, orders!inner(id, ref, status, suppliers(business_name))" as const;

type ShipmentData = {
  id: string; carrier: string; tracking_ref: string; status: Enums["shipment_status"]; cod_amount_centavos: number; updated_at: string;
  orders: { id: string; ref: string; suppliers: { business_name: string } | null } | null;
};
const toShipment = (s: ShipmentData): AdminShipmentRow => ({
  id: s.id, carrier: s.carrier, trackingRef: s.tracking_ref, status: s.status, codCentavos: s.cod_amount_centavos, updatedAt: s.updated_at,
  order: s.orders ? { id: s.orders.id, ref: s.orders.ref } : null, supplierName: s.orders?.suppliers?.business_name ?? null,
});

/**
 * Open problems: returned or failed-attempt shipments whose order is still live. A shipment that was
 * delivered after a failed attempt is no longer in these statuses; a cancelled or completed order is closed.
 * shortcut: "live" ignores whether the refund for a returned parcel was already made; refine if that is needed.
 */
export async function openProblemShipments(): Promise<AdminShipmentRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("shipments")
    .select(SHIPMENT_COLUMNS)
    .in("status", PROBLEM_SHIPMENTS)
    .not("orders.status", "in", "(cancelled,completed)")
    .order("updated_at", { ascending: false })
    .limit(100);
  if (error) fail(error);
  return (data as unknown as ShipmentData[]).map(toShipment);
}

export async function listAdminShipments(p: ListParams): Promise<Paged<AdminShipmentRow>> {
  const supabase = await createClient();
  const [from, to] = range(p.page);
  let query = supabase.from("shipments").select(SHIPMENT_COLUMNS, { count: "exact" }).order("updated_at", { ascending: false }).range(from, to);
  if (p.status === "problem") query = query.in("status", PROBLEM_SHIPMENTS);
  else if (p.status) query = query.eq("status", p.status as Enums["shipment_status"]);
  if (p.q) {
    const byRef = await orderIdsByRef(p.q);
    const parts = [`tracking_ref.ilike.%${p.q}%`];
    if (byRef.length) parts.push(`order_id.in.${inList(byRef.map((o) => o.id))}`);
    query = query.or(parts.join(","));
  }
  const { data, error, count } = await query;
  if (error) fail(error);
  return paged((data as unknown as ShipmentData[]).map(toShipment), count, p.page);
}

// ---------------------------------------------------------------- transactions

/** The order (if any) started from each selection id, for tracing a deal through to payment. */
export async function ordersBySelection(selectionIds: string[]): Promise<Record<string, { id: string; ref: string; status: Enums["order_status"] }>> {
  if (!selectionIds.length) return {};
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select("id, ref, status, checkouts!inner(selection_id)")
    .in("checkouts.selection_id", selectionIds)
    .neq("status", "cancelled");
  if (error) fail(error);
  const out: Record<string, { id: string; ref: string; status: Enums["order_status"] }> = {};
  for (const o of data) if (o.checkouts?.selection_id) out[o.checkouts.selection_id] = { id: o.id, ref: o.ref, status: o.status };
  return out;
}

// ---------------------------------------------------------------- claims

export const CLAIM_STATUSES = ["open", "awaiting_return", "refund_pending", "replacement_pending", "rejected", "escalated", "declined", "resolved", "cancelled"] as const;

export type AdminClaimRow = {
  id: string; ref: string; type: string; status: Enums["claim_status"]; createdAt: string;
  order: { id: string; ref: string } | null; supplierName: string;
};

export async function listAdminClaims(p: ListParams): Promise<Paged<AdminClaimRow> & { escalated: number }> {
  const supabase = await createClient();
  const [from, to] = range(p.page);
  let query = supabase
    .from("claims")
    .select("id, ref, type, status, created_at, orders(id, ref), suppliers(business_name)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);
  if (p.status) query = query.eq("status", p.status as Enums["claim_status"]);
  if (p.q) {
    const byRef = await orderIdsByRef(p.q);
    const parts = [`ref.ilike.%${p.q}%`];
    if (byRef.length) parts.push(`order_id.in.${inList(byRef.map((o) => o.id))}`);
    query = query.or(parts.join(","));
  }
  const [{ data, error, count }, esc] = await Promise.all([
    query,
    supabase.from("claims").select("id", { count: "exact", head: true }).eq("status", "escalated"),
  ]);
  if (error) fail(error);
  const rows = data.map((c) => ({
    id: c.id, ref: c.ref, type: c.type, status: c.status, createdAt: c.created_at, order: c.orders,
    supplierName: c.suppliers?.business_name ?? "Supplier",
  }));
  return { ...paged(rows, count, p.page), escalated: esc.count ?? 0 };
}

/**
 * Most a claim decision can still refund on an order, mirroring private.claimable_left: order total minus
 * non-failed refunds minus manual refunds of refund-pending or resolved claims. Display only; the database enforces it.
 */
export async function claimableLeft(orderId: string): Promise<number> {
  const supabase = await createClient();
  const [o, r, c] = await Promise.all([
    supabase.from("orders").select("total_centavos").eq("id", orderId).maybeSingle(),
    supabase.from("refunds").select("amount_centavos").eq("order_id", orderId).neq("status", "failed"),
    supabase.from("claims").select("manual_refund_centavos").eq("order_id", orderId).in("status", ["refund_pending", "resolved"]),
  ]);
  const sum = (rows: { [k: string]: number }[] | null, k: string) => (rows ?? []).reduce((s, x) => s + x[k], 0);
  return Math.max(0, (o.data?.total_centavos ?? 0) - sum(r.data, "amount_centavos") - sum(c.data, "manual_refund_centavos"));
}

// ---------------------------------------------------------------- reviews

export type AdminReview = {
  id: string; rating: number; body: string; supplierReply: string; hidden: boolean; hiddenReason: string; createdAt: string;
  supplierName: string; order: { id: string; ref: string } | null; buyerName: string;
};

/** Reviews for moderation, newest first, with whose storefront, which order and who wrote them. */
export async function listAdminReviews(): Promise<AdminReview[]> {
  const supabase = await createClient();
  // shortcut: newest 200 only; add paging when there are more reviews than that.
  const { data, error } = await supabase
    .from("reviews")
    .select("id, rating, body, supplier_reply, hidden, hidden_reason, created_at, buyer_id, suppliers(business_name), orders(id, ref)")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) fail(error);
  const buyerIds = [...new Set(data.map((r) => r.buyer_id))];
  const names: Record<string, string> = {};
  if (buyerIds.length) {
    const { data: ps } = await supabase.from("profiles").select("id, full_name").in("id", buyerIds);
    for (const p of ps ?? []) names[p.id] = p.full_name;
  }
  return data.map((r) => ({
    id: r.id, rating: r.rating, body: r.body, supplierReply: r.supplier_reply, hidden: r.hidden, hiddenReason: r.hidden_reason,
    createdAt: r.created_at, supplierName: r.suppliers?.business_name ?? "Supplier", order: r.orders, buyerName: names[r.buyer_id] || "Buyer",
  }));
}
