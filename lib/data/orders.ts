import "server-only";
import { cache } from "react";
import { getSessionUser } from "@/lib/auth";
import { mediaUrl } from "@/lib/data/catalog";
import { unitPriceFor } from "@/lib/pricing";
import { createClient } from "@/lib/supabase/server";
import type { CartLine, Order, OrderStatus, PaymentMethod } from "@/lib/types";

// Reads for carts, orders and finance. RLS scopes everything: buyers see their own, suppliers their
// paid orders, finance/support admins (MFA) all. Money stays integer centavos.

function fail(error: { message: string }): never {
  throw new Error(error.message);
}

// ---------------------------------------------------------------- cart

export const getCart = cache(async (): Promise<CartLine[]> => {
  const user = await getSessionUser();
  if (!user) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cart_items")
    .select(
      "id, product_id, variant_id, quantity, products(title, moq, unit, indicative_price_centavos, stock, status, supplier_id, suppliers(business_name, status), price_tiers(min_qty, unit_price_centavos), product_media(storage_path, sort_order)), product_variants(name, price_delta_centavos, stock, active)",
    )
    .order("created_at");
  if (error) fail(error);
  return data.flatMap((c) => {
    const p = c.products;
    if (!p) return []; // listing no longer visible
    const v = c.product_variants;
    const tiers = p.price_tiers.map((t) => ({ minQty: t.min_qty, unitPriceCentavos: t.unit_price_centavos }));
    const image = [...p.product_media].sort((a, b) => a.sort_order - b.sort_order)[0];
    return [
      {
        id: c.id,
        productId: c.product_id,
        variantId: c.variant_id,
        title: p.title,
        variantName: v?.name ?? "",
        supplierId: p.supplier_id,
        supplierName: p.suppliers?.business_name ?? "Supplier",
        quantity: c.quantity,
        moq: p.moq,
        unit: p.unit,
        unitPriceCentavos: unitPriceFor(p.indicative_price_centavos, tiers, c.quantity, v?.price_delta_centavos ?? 0),
        stock: v ? v.stock : p.stock,
        imageUrl: image ? mediaUrl(image.storage_path) : null,
        available: p.status === "approved" && p.suppliers?.status === "verified" && (v ? v.active : true),
      },
    ];
  });
});

// ---------------------------------------------------------------- orders

const ORDER_COLUMNS =
  "*, suppliers(business_name), order_items(*), order_status_history(to_status, reason, created_at), refunds(id, amount_centavos, status, reason, created_at), checkouts(selection_id, payments(method, status, provider_ref))" as const;

type OrderRow = {
  id: string; ref: string; buyer_id: string; supplier_id: string; status: OrderStatus; items_centavos: number; fees_centavos: number;
  total_centavos: number; commission_centavos: number; gateway_fee_centavos: number; paid_at: string | null;
  delivered_at: string | null; cancelled_at: string | null; created_at: string;
  suppliers: { business_name: string } | null;
  order_items: { id: string; title: string; variant_name: string; unit: Order["items"][number]["unit"]; quantity: number;
    unit_price_centavos: number; line_total_centavos: number; return_class: Order["items"][number]["returnClass"] }[];
  order_status_history: { to_status: OrderStatus; reason: string; created_at: string }[];
  refunds: { id: string; amount_centavos: number; status: Order["refunds"][number]["status"]; reason: string; created_at: string }[];
  checkouts: { selection_id: string | null; payments: { method: PaymentMethod; status: string; provider_ref: string | null } | null } | null;
};

function toOrder(o: OrderRow): Order {
  return {
    id: o.id, ref: o.ref, buyerId: o.buyer_id, supplierId: o.supplier_id, supplierName: o.suppliers?.business_name ?? "Supplier",
    status: o.status, itemsCentavos: o.items_centavos, feesCentavos: o.fees_centavos, totalCentavos: o.total_centavos,
    commissionCentavos: o.commission_centavos, gatewayFeeCentavos: o.gateway_fee_centavos, paidAt: o.paid_at,
    deliveredAt: o.delivered_at, cancelledAt: o.cancelled_at, createdAt: o.created_at,
    items: o.order_items.map((i) => ({
      id: i.id, title: i.title, variantName: i.variant_name, unit: i.unit, quantity: i.quantity,
      unitPriceCentavos: i.unit_price_centavos, lineTotalCentavos: i.line_total_centavos, returnClass: i.return_class,
    })),
    history: o.order_status_history
      .map((h) => ({ toStatus: h.to_status, reason: h.reason, createdAt: h.created_at }))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    refunds: o.refunds.map((r) => ({ id: r.id, amountCentavos: r.amount_centavos, status: r.status, reason: r.reason, createdAt: r.created_at })),
    payment: o.checkouts?.payments
      ? { method: o.checkouts.payments.method, status: o.checkouts.payments.status, providerRef: o.checkouts.payments.provider_ref }
      : null,
    selectionId: o.checkouts?.selection_id ?? null,
  };
}

/**
 * Orders for one view, newest first: "buyer" = my purchases, "supplier" = orders to my business (paid only),
 * "admin" = everything (finance/support with MFA).
 */
export async function listOrders(view: "buyer" | "supplier" | "admin"): Promise<Order[]> {
  const user = await getSessionUser();
  if (!user) return [];
  const supabase = await createClient();
  let q = supabase.from("orders").select(ORDER_COLUMNS).order("created_at", { ascending: false });
  if (view === "buyer") q = q.eq("buyer_id", user.id);
  if (view === "supplier") {
    const { data: s } = await supabase.from("suppliers").select("id").eq("owner_id", user.id).maybeSingle();
    if (!s) return [];
    q = q.eq("supplier_id", s.id);
  }
  // shortcut: no paging; add range() once an account has hundreds of orders.
  const { data, error } = await q;
  if (error) fail(error);
  return (data as unknown as OrderRow[]).map(toOrder);
}

/** One order the caller may see, with the buyer's contact for suppliers and admins; null otherwise. */
export async function getOrder(id: string): Promise<(Order & { buyer: { name: string; businessName: string; email: string; phone: string } | null }) | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.from("orders").select(ORDER_COLUMNS).eq("id", id).maybeSingle();
  if (error) fail(error);
  if (!data) return null;
  const order = toOrder(data as unknown as OrderRow);
  const { data: p } = await supabase.from("profiles").select("full_name, business_name, email, phone").eq("id", order.buyerId).maybeSingle();
  return { ...order, buyer: p ? { name: p.full_name, businessName: p.business_name, email: p.email, phone: p.phone } : null };
}

/** The buyer's order for an RFQ deal, if they started paying for it. */
export async function orderForSelection(selectionId: string): Promise<{ id: string; status: OrderStatus } | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("orders")
    .select("id, status, checkouts!inner(selection_id)")
    .eq("checkouts.selection_id", selectionId)
    .neq("status", "cancelled")
    .maybeSingle();
  return data ? { id: data.id, status: data.status } : null;
}

// ---------------------------------------------------------------- payments page (fake gateway)

/** The caller's payment session by gateway reference (fake pay page). */
export async function getPaymentByRef(providerRef: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payments")
    .select("id, amount_centavos, method, status, provider_ref, checkouts(expires_at, status, orders(ref, total_centavos, suppliers(business_name)))")
    .eq("provider_ref", providerRef)
    .maybeSingle();
  if (error) fail(error);
  return data;
}

// ---------------------------------------------------------------- finance

export async function listPayments() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payments")
    .select("id, amount_centavos, fee_centavos, method, status, provider, provider_ref, paid_at, created_at, checkouts(buyer_id, orders(ref))")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) fail(error);
  return data;
}

export async function listRefunds() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("refunds")
    .select("id, amount_centavos, status, reason, created_at, completed_at, orders(ref)")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) fail(error);
  return data;
}

/** Payouts: finance sees all, a supplier their own. */
export async function listPayouts() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payouts")
    .select("id, ref, amount_centavos, status, scheduled_at, released_at, provider_ref, suppliers(business_name), payout_items(amount_centavos, orders(ref))")
    .order("scheduled_at", { ascending: false })
    .limit(200);
  if (error) fail(error);
  return data;
}

/** Balance per ledger account (credit - debit) and the latest entries. Finance only (RLS). */
export async function ledgerSummary() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ledger_entries")
    .select("id, txn_id, account, debit_centavos, credit_centavos, memo, created_at, orders(ref), suppliers(business_name)")
    .order("id", { ascending: false })
    .limit(500);
  if (error) fail(error);
  // shortcut: balances summed over the latest 500 entries in the app; move to a SQL view before real volume.
  const balances: Record<string, number> = {};
  for (const e of data) balances[e.account] = (balances[e.account] ?? 0) + e.credit_centavos - e.debit_centavos;
  return { balances, entries: data };
}

/** What the signed-in supplier is owed right now (sum of its payable ledger lines). */
export async function myPayableBalance(): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("ledger_entries").select("debit_centavos, credit_centavos").eq("account", "supplier_payable");
  if (error) fail(error);
  return data.reduce((sum, e) => sum + e.credit_centavos - e.debit_centavos, 0);
}
