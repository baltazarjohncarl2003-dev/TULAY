import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Order } from "@/lib/types";

// Supplier payout reads. RLS: a supplier sees only its own supplier_payable ledger lines and payouts.

function fail(error: { message: string }): never {
  throw new Error(error.message);
}

/**
 * Per order: what the online money left the supplier with (paid online, less gateway fee, commission and
 * refunds), from its supplier_payable ledger lines. Payout lines are left out so a released payout does not
 * look like money lost. COD cash never passes through TULAY, so it is not in here.
 */
export async function orderPayableNets(supplierId: string): Promise<Record<string, number>> {
  const supabase = await createClient();
  // shortcut: reads every payable line of the supplier; move to a per-order sum view once suppliers have thousands of orders.
  const { data, error } = await supabase
    .from("ledger_entries")
    .select("order_id, credit_centavos, debit_centavos")
    .eq("account", "supplier_payable")
    .eq("supplier_id", supplierId)
    .is("payout_id", null);
  if (error) fail(error);
  const nets: Record<string, number> = {};
  for (const e of data) if (e.order_id) nets[e.order_id] = (nets[e.order_id] ?? 0) + e.credit_centavos - e.debit_centavos;
  return nets;
}

export type OrderPayout = { ref: string; status: "scheduled" | "released"; amountCentavos: number; scheduledAt: string; releasedAt: string | null };

/** The payouts an order's money went into (more than one when a later refund was deducted). */
export async function payoutsForOrder(orderId: string): Promise<OrderPayout[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payout_items")
    .select("amount_centavos, payouts(ref, status, scheduled_at, released_at)")
    .eq("order_id", orderId);
  if (error) fail(error);
  return data
    .flatMap((i) =>
      i.payouts
        ? [{ ref: i.payouts.ref, status: i.payouts.status, amountCentavos: i.amount_centavos, scheduledAt: i.payouts.scheduled_at, releasedAt: i.payouts.released_at }]
        : [],
    )
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
}

/**
 * What the supplier keeps of an order: total less commission, gateway fee, succeeded online refunds and COD cash
 * paid back on resolved claims, and less the booked courier price once the parcel is booked on TULAY's courier
 * account (mirrors record_shipment; the buyer's delivery excess comes back as a refund, already in `refunded`).
 * A cancelled order keeps only what is left in its payable ledger (null = nothing).
 */
export function youReceive(o: Order, manualRefundCentavos: number, payableNet: number | undefined): number | null {
  if (o.status === "cancelled") return payableNet && payableNet > 0 ? payableNet : null;
  const refunded = o.refunds.filter((r) => r.status === "succeeded").reduce((sum, r) => sum + r.amountCentavos, 0);
  const shippingToTulay = o.shipment && !o.shipment.manual ? (o.shipment.priceCentavos ?? o.shippingCentavos) : 0;
  return o.totalCentavos - o.commissionCentavos - o.gatewayFeeCentavos - refunded - manualRefundCentavos - shippingToTulay;
}

/** Most still refundable on an order; mirrors private.claimable_left in the database (display hint only). */
export function claimableLeft(o: Order, manualRefundCentavos: number): number {
  const refunded = o.refunds.filter((r) => r.status !== "failed").reduce((sum, r) => sum + r.amountCentavos, 0);
  return Math.max(0, o.totalCentavos - refunded - manualRefundCentavos);
}

/** When a delivered order becomes payout-eligible (delivery date plus the admin payout delay), as an ISO date; null before delivery. */
export function payoutEligibleAt(o: Order, delayDays: number): string | null {
  if (!o.deliveredAt) return null;
  const d = new Date(o.deliveredAt);
  d.setUTCDate(d.getUTCDate() + delayDays);
  return d.toISOString();
}
