import "server-only";
import { cache } from "react";
import { getSessionUser } from "@/lib/auth";
import { mediaUrl } from "@/lib/data/catalog";
import { getPaymentProvider } from "@/lib/payments";
import { unitPriceFor } from "@/lib/pricing";
import { createClient } from "@/lib/supabase/server";
import type { Address, CartLine, Order, OrderStatus, PaymentMethod, ShipmentStatus, ShipTo } from "@/lib/types";

// Reads for carts, orders and finance. RLS scopes everything: buyers see their own, suppliers their
// paid orders, finance/support admins (MFA) all. Money stays integer centavos.

function fail(error: { message: string }): never {
  throw new Error(error.message);
}

// ---------------------------------------------------------------- cart

/** Cart lines plus `custom` (custom-made item), which the COD estimate needs. */
export const getCart = cache(async (): Promise<(CartLine & { custom: boolean })[]> => {
  const user = await getSessionUser();
  if (!user) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cart_items")
    .select(
      "id, product_id, variant_id, quantity, products(title, moq, unit, indicative_price_centavos, stock, status, return_class, supplier_id, suppliers(business_name, status), price_tiers(min_qty, unit_price_centavos), product_media(storage_path, sort_order)), product_variants(name, price_delta_centavos, stock, active)",
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
        custom: p.return_class === "custom",
      },
    ];
  });
});

// ---------------------------------------------------------------- orders

const ORDER_COLUMNS =
  "*, suppliers(business_name), order_items(*), order_status_history(to_status, reason, created_at), refunds(id, amount_centavos, status, reason, created_at), checkouts!orders_checkout_id_fkey(selection_id, payments(method, status, provider_ref)), artwork_files(id, storage_path, file_name, note, created_at), proofs(id, version, storage_path, note, status, response_note, created_at), shipments(carrier, carrier_name, manual, tracking_ref, status, cod_amount_centavos, price_centavos, share_link, voided_at, updated_at, tracking_events(status, note, occurred_at))" as const;

type OrderRow = {
  id: string; ref: string; buyer_id: string; supplier_id: string; status: OrderStatus; items_centavos: number; fees_centavos: number;
  total_centavos: number; commission_centavos: number; gateway_fee_centavos: number; paid_at: string | null;
  delivered_at: string | null; cancelled_at: string | null; created_at: string;
  shipping_centavos: number; shipping_due_centavos: number; courier_booking_claimed_at: string | null; shipping_quote_id: string | null;
  fulfilment_mode: Order["fulfilmentMode"]; ship_to: ShipTo | null; payment_option: "online" | "cod" | "split";
  downpayment_centavos: number; paid_online_centavos: number; proof_approved_at: string | null; delivery_claimed_at: string | null;
  artwork_files: { id: string; storage_path: string; file_name: string; note: string; created_at: string }[];
  proofs: { id: string; version: number; storage_path: string; note: string; status: Order["proofs"][number]["status"]; response_note: string; created_at: string }[];
  // An array since order_id stopped being unique (voided bookings stay); the active one has voided_at null.
  shipments: { carrier: string; carrier_name: string; manual: boolean; tracking_ref: string; status: ShipmentStatus; cod_amount_centavos: number;
    price_centavos: number | null; share_link: string | null; voided_at: string | null; updated_at: string;
    tracking_events: { status: ShipmentStatus; note: string; occurred_at: string }[] }[];
  suppliers: { business_name: string } | null;
  order_items: { id: string; title: string; variant_name: string; unit: Order["items"][number]["unit"]; quantity: number;
    unit_price_centavos: number; line_total_centavos: number; return_class: Order["items"][number]["returnClass"] }[];
  order_status_history: { to_status: OrderStatus; reason: string; created_at: string }[];
  refunds: { id: string; amount_centavos: number; status: Order["refunds"][number]["status"]; reason: string; created_at: string }[];
  checkouts: { selection_id: string | null; payments: { method: PaymentMethod; status: string; provider_ref: string | null } | null } | null;
};

function toOrder(o: OrderRow): Order {
  const sh = o.shipments.find((s) => s.voided_at === null) ?? null;
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
    shippingCentavos: o.shipping_centavos,
    shippingDueCentavos: o.shipping_due_centavos,
    courierBookingClaimedAt: o.courier_booking_claimed_at,
    shippingQuoteId: o.shipping_quote_id,
    fulfilmentMode: o.fulfilment_mode,
    shipTo: o.ship_to,
    paymentOption: o.payment_option,
    downpaymentCentavos: o.downpayment_centavos,
    paidOnlineCentavos: o.paid_online_centavos,
    proofApprovedAt: o.proof_approved_at,
    deliveryClaimedAt: o.delivery_claimed_at,
    artwork: o.artwork_files
      .map((a) => ({ id: a.id, storagePath: a.storage_path, fileName: a.file_name, note: a.note, createdAt: a.created_at }))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    proofs: o.proofs
      .map((p) => ({ id: p.id, version: p.version, storagePath: p.storage_path, note: p.note, status: p.status, responseNote: p.response_note, createdAt: p.created_at }))
      .sort((a, b) => a.version - b.version),
    shipment: sh
      ? {
          carrier: sh.carrier, carrierName: sh.carrier_name, manual: sh.manual,
          trackingRef: sh.tracking_ref, status: sh.status, updatedAt: sh.updated_at,
          codAmountCentavos: sh.cod_amount_centavos, priceCentavos: sh.price_centavos, shareLink: sh.share_link,
          events: sh.tracking_events
            .map((e) => ({ status: e.status, note: e.note, occurredAt: e.occurred_at }))
            .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)),
        }
      : null,
    custom: o.order_items.some((i) => i.return_class === "custom"),
  };
}

// ---------------------------------------------------------------- addresses and order files

export async function listMyAddresses(): Promise<Address[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("addresses").select("*").order("created_at");
  if (error) fail(error);
  return data.map((a) => ({
    id: a.id, label: a.label, recipient: a.recipient, phone: a.phone, line1: a.line1, line2: a.line2,
    barangay: a.barangay, city: a.city, province: a.province, postalCode: a.postal_code,
    lat: a.lat, lng: a.lng,
  }));
}

export type OpenCheckout = { id: string; totalCentavos: number; expiresAt: string; payUrl: string };

/** The buyer's unpaid cart checkout whose payment page is open. It blocks a new checkout until paid, cancelled or expired. */
export async function getOpenCheckout(): Promise<OpenCheckout | null> {
  const user = await getSessionUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payments")
    .select("provider_ref, checkouts!inner(id, total_centavos, expires_at)")
    .eq("status", "pending")
    .not("provider_ref", "is", null)
    .eq("checkouts.buyer_id", user.id)
    .eq("checkouts.status", "pending")
    .is("checkouts.selection_id", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) fail(error);
  if (!data?.provider_ref) return null;
  const c = data.checkouts;
  return { id: c.id, totalCentavos: c.total_centavos, expiresAt: c.expires_at, payUrl: getPaymentProvider().resumeUrl(data.provider_ref) };
}

/** Where the buyer resumes paying a pending order, from the payment adapter; null when nothing is payable. */
export function payUrlFor(o: Order): string | null {
  return o.status === "pending_payment" && o.payment?.status === "pending" && o.payment.providerRef
    ? getPaymentProvider().resumeUrl(o.payment.providerRef)
    : null;
}

/** Links to an order's private files (artwork, proofs), valid for an hour so a long proof review still opens them. Storage RLS: order parties and support only. */
export async function signedOrderFileUrls(paths: string[]): Promise<Record<string, string>> {
  if (!paths.length) return {};
  const supabase = await createClient();
  const { data } = await supabase.storage.from("order-files").createSignedUrls(paths, 3600);
  return Object.fromEntries((data ?? []).flatMap((d) => (d.path && d.signedUrl ? [[d.path, d.signedUrl]] : [])));
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
  // RPC: suppliers cannot read checkouts, so a direct join would hide the order from them.
  const { data } = await supabase.rpc("order_for_selection", { p_selection_id: selectionId }).maybeSingle();
  return data ? { id: data.order_id, status: data.status } : null;
}

/** The RFQ behind a deal order (by its selection), for a link back to the agreed terms. */
export async function rfqForSelection(selectionId: string): Promise<{ id: string; ref: string } | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("selections").select("rfq_id, rfqs(ref)").eq("id", selectionId).maybeSingle();
  return data?.rfqs ? { id: data.rfq_id, ref: data.rfqs.ref } : null;
}

// ---------------------------------------------------------------- payments page (fake gateway)

/** The caller's payment session by gateway reference (fake pay page). */
export async function getPaymentByRef(providerRef: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payments")
    .select("id, amount_centavos, method, status, provider_ref, checkouts(expires_at, status, orders!orders_checkout_id_fkey(ref, total_centavos, payment_option, downpayment_centavos, suppliers(business_name)), balance:orders!checkouts_order_id_fkey(ref, suppliers(business_name)))")
    .eq("provider_ref", providerRef)
    .maybeSingle();
  if (error) fail(error);
  return data;
}

// ---------------------------------------------------------------- finance

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

/** Admin setting: days after delivery before a payout is released. */
export async function payoutDelayDays(): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase.from("platform_settings").select("value").eq("key", "payout_delay_days").maybeSingle();
  return typeof data?.value === "number" ? data.value : 7;
}

/** What the signed-in supplier is owed right now (sum of its payable ledger lines). */
export async function myPayableBalance(): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("ledger_balances").select("balance_centavos").eq("account", "supplier_payable");
  if (error) fail(error);
  return data.reduce((sum, b) => sum + (b.balance_centavos ?? 0), 0); // RLS: only this supplier's rows
}

/** What the checkout screens need: the buyer's addresses and the delivery / COD settings (admin values). */
export async function getCheckoutOptions(): Promise<{
  addresses: Address[];
  shippingFeeCentavos: number;
  /** Courier fee by address id then supplier id (the database's zone fee; checkout recomputes it). */
  shippingFees: Record<string, Record<string, number>>;
  /** 0 = COD is off. */
  codMaxOrderCentavos: number;
  codDownpaymentBps: number;
}> {
  const supabase = await createClient();
  const [addresses, { data: rows }, { data: fees }] = await Promise.all([
    listMyAddresses(),
    supabase.from("platform_settings").select("key, value").in("key", ["shipping_flat_fee_centavos", "cod_max_order_centavos", "cod_downpayment_bps"]),
    supabase.rpc("cart_shipping_fees"),
  ]);
  const n = (k: string) => {
    const v = rows?.find((r) => r.key === k)?.value;
    return typeof v === "number" ? v : 0;
  };
  return {
    addresses,
    shippingFeeCentavos: n("shipping_flat_fee_centavos"),
    shippingFees: (fees ?? []).reduce<Record<string, Record<string, number>>>((m, f) => {
      (m[f.address_id] ??= {})[f.supplier_id] = f.fee_centavos;
      return m;
    }, {}),
    codMaxOrderCentavos: n("cod_max_order_centavos"),
    codDownpaymentBps: n("cod_downpayment_bps"),
  };
}

/** Province names for the address form (canonical rows only; aliases still match at checkout). */
export const listProvinces = cache(async (): Promise<string[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("ph_provinces").select("name").eq("canonical", true).order("name");
  if (error) throw new Error(error.message);
  return data.map((p) => p.name);
});
