"use server";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { type ActionResult, dbError, parseInput } from "@/lib/action-result";
import { canPlayCourier } from "@/lib/auth";
import { getCourier } from "@/lib/shipping";
import { signFakeTracking } from "@/lib/shipping/fake";
import { CourierError } from "@/lib/shipping/types";
import { settleRefund } from "@/lib/refunds";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { POST as shippingWebhook } from "@/app/api/webhooks/shipping/route";
import { addressSchema, manualShipmentSchema } from "@/lib/validation/forms";

// Addresses, artwork and proofs, production, shipping and delivery confirmation. The database checks
// who may act and which steps are allowed; these actions validate input and talk to the courier adapter.

const uuid = z.string().uuid();
const notFound: Exclude<ActionResult, { ok: true }> = { ok: false, error: "Not found" };

// ---------------------------------------------------------------- addresses


const toRow = (a: z.output<typeof addressSchema>) => ({
  label: a.label, recipient: a.recipient, phone: a.phone, line1: a.line1, line2: a.line2,
  barangay: a.barangay, city: a.city, province: a.province, postal_code: a.postalCode,
});

/** Adds (addressId null) or edits one of the caller's addresses. RLS: own rows only. */
export async function saveAddress(addressId: string | null, raw: Record<string, unknown>): Promise<ActionResult> {
  if (addressId !== null && !uuid.safeParse(addressId).success) return notFound;
  const input = parseInput(addressSchema, raw);
  if (!input.ok) return input;
  const supabase = await createClient();
  const { error } = addressId
    ? await supabase.from("addresses").update(toRow(input.data)).eq("id", addressId)
    : await supabase.from("addresses").insert(toRow(input.data));
  return error ? dbError(error) : { ok: true };
}

export async function deleteAddress(addressId: string): Promise<ActionResult> {
  if (!uuid.safeParse(addressId).success) return notFound;
  const supabase = await createClient();
  const { error } = await supabase.from("addresses").delete().eq("id", addressId);
  return error ? dbError(error) : { ok: true };
}

// ---------------------------------------------------------------- artwork and proofs

const filePath = (orderId: string, kind: "artwork" | "proofs") =>
  z.string().refine((p) => new RegExp(`^${orderId}/${kind}/[A-Za-z0-9._-]{1,200}$`).test(p), "Invalid file path");

/** Buyer: records artwork already uploaded to order-files/<orderId>/artwork/<file>. */
export async function addArtwork(orderId: string, storagePath: string, fileName: string, note = ""): Promise<ActionResult> {
  if (!uuid.safeParse(orderId).success || !filePath(orderId, "artwork").safeParse(storagePath).success) return notFound;
  const supabase = await createClient();
  const { error } = await supabase.rpc("add_artwork", {
    p_order_id: orderId,
    p_storage_path: storagePath,
    p_file_name: String(fileName).slice(0, 200),
    p_note: String(note).slice(0, 1000),
  });
  return error ? dbError(error) : { ok: true };
}

/** Supplier: sends a proof already uploaded to order-files/<orderId>/proofs/<file>. */
export async function sendProof(orderId: string, storagePath: string, note = ""): Promise<ActionResult> {
  if (!uuid.safeParse(orderId).success || !filePath(orderId, "proofs").safeParse(storagePath).success) return notFound;
  const supabase = await createClient();
  const { error } = await supabase.rpc("send_proof", { p_order_id: orderId, p_storage_path: storagePath, p_note: String(note).slice(0, 1000) });
  return error ? dbError(error) : { ok: true };
}

/** Buyer: approve the proof (frozen; cancellation ends) or ask for changes (note required). */
export async function respondProof(proofId: string, approve: boolean, note = ""): Promise<ActionResult> {
  if (!uuid.safeParse(proofId).success) return notFound;
  const supabase = await createClient();
  const { error } = await supabase.rpc("respond_proof", { p_proof_id: proofId, p_approve: approve === true, p_note: String(note).slice(0, 1000) });
  return error ? dbError(error) : { ok: true };
}

// ---------------------------------------------------------------- production, shipping, delivery

const step = (fn: "start_production" | "mark_shipped" | "mark_delivered" | "confirm_delivery") =>
  async (orderId: string): Promise<ActionResult> => {
    if (!uuid.safeParse(orderId).success) return notFound;
    const supabase = await createClient();
    const { error } = await supabase.rpc(fn, { p_order_id: orderId });
    return error ? dbError(error) : { ok: true };
  };

/** Supplier: production starts (custom orders need an approved proof). */
export async function startProduction(orderId: string) {
  return step("start_production")(orderId);
}
/** Supplier, non-courier orders: handed over (own delivery / freight) or ready for pickup. */
export async function markShipped(orderId: string) {
  return step("mark_shipped")(orderId);
}
/** Supplier, non-courier orders: delivered; the buyer confirms or it auto-confirms. */
export async function markDelivered(orderId: string) {
  return step("mark_delivered")(orderId);
}
/** Buyer, non-courier orders: confirms delivery. */
export async function confirmDelivery(orderId: string) {
  return step("confirm_delivery")(orderId);
}

/** Supplier, courier orders: books the pickup with the courier, then records it. COD amount comes from the database. */
export async function bookShipment(orderId: string): Promise<ActionResult> {
  if (!uuid.safeParse(orderId).success) return notFound;
  const supabase = await createClient();
  const { data: o } = await supabase
    .from("orders")
    .select("ref, supplier_id, ship_to, payment_option, total_centavos, paid_online_centavos, fulfilment_mode")
    .eq("id", orderId)
    .maybeSingle();
  if (!o || o.fulfilment_mode !== "courier" || !o.ship_to) return { ok: false, error: "This order is not delivered by courier" };
  // A booking costs money: check ownership, readiness and "not booked yet" before calling the courier.
  // Two clicks in the same instant can both pass this check; Ninja Van gets the same requested tracking number
  // from the order ref and refuses the second, and record_shipment's unique order_id keeps the DB consistent.
  const { error: notReady } = await supabase.rpc("check_can_book_shipment", { p_order_id: orderId });
  if (notReady) return dbError(notReady);
  const { data: p } = await supabase.from("supplier_pickup_settings").select("*").eq("supplier_id", o.supplier_id).maybeSingle();
  const courier = getCourier();
  let trackingRef: string;
  try {
    const booked = await courier.book({
      orderRef: o.ref,
      shipTo: o.ship_to as never,
      codAmountCentavos: o.payment_option === "cod" ? o.total_centavos - o.paid_online_centavos : 0,
      pickupFrom: p && {
        name: p.sender_name, phone: p.phone, line1: p.line1, line2: p.line2, barangay: p.barangay,
        city: p.city, province: p.province, postalCode: p.postal_code, parcelWeightGrams: p.parcel_weight_grams,
      },
    });
    trackingRef = booked.trackingRef;
  } catch (e) {
    if (e instanceof CourierError) return { ok: false, error: e.message };
    console.error("courier booking failed", e);
    return { ok: false, error: "The courier could not book the pickup. Try again in a few minutes." };
  }
  // Service role only: the parcel is on TULAY's courier account, and recording it moves the shipping fee to TULAY.
  // The supplier's right to book this order was checked above with its own session (check_can_book_shipment).
  const { error } = await createAdminClient().rpc("record_shipment", {
    p_order_id: orderId, p_carrier: courier.name, p_tracking_ref: trackingRef,
  });
  if (error) console.error("courier booked but not recorded", orderId, trackingRef, error.message); // support links it by hand
  return error ? dbError(error) : { ok: true };
}

export type BulkBookResult = { orderId: string; ok: boolean; message: string };

/** Supplier: books several orders in one click (one at a time, so each keeps its own checks and errors). */
export async function bookShipments(orderIds: string[]): Promise<{ ok: true; results: BulkBookResult[] } | { ok: false; error: string }> {
  const ids = z.array(uuid).min(1).max(50).safeParse(orderIds);
  if (!ids.success) return { ok: false, error: "Choose up to 50 orders" };
  const results: BulkBookResult[] = [];
  for (const orderId of new Set(ids.data)) {
    const res = await bookShipment(orderId);
    results.push({ orderId, ok: res.ok, message: res.ok ? "Booked" : res.error });
  }
  return { ok: true, results };
}

const trackingStatus = z.enum(["picked_up", "in_transit", "out_for_delivery", "delivered", "failed_attempt", "returned"]);

/**
 * Fake courier only (test page /ship/fake/<ref>): posts a signed tracking webhook to our own route, like the
 * real courier would. Only the supplier who owns the shipment (or support) can see it, so only they can trigger it.
 */
export async function simulateTracking(trackingRef: string, status: string, note = ""): Promise<ActionResult> {
  const courier = getCourier();
  if (courier.name !== "fake") return { ok: false, error: "Not available" };
  const s = trackingStatus.safeParse(status);
  if (!s.success) return { ok: false, error: "Unknown status" };
  const supabase = await createClient();
  const { data: sh } = await supabase
    .from("shipments")
    .select("cod_amount_centavos, orders(supplier_id)")
    .eq("tracking_ref", trackingRef)
    .eq("carrier", courier.name)
    .eq("manual", false)
    .maybeSingle();
  // Buyers can see their shipment too; only the shipping supplier (or support) plays the courier.
  if (!sh || !(await canPlayCourier(sh.orders?.supplier_id))) return notFound;
  const { body, headers } = signFakeTracking({
    id: `trk_${randomUUID()}`,
    trackingRef,
    status: s.data,
    occurredAt: new Date().toISOString(),
    note: String(note).slice(0, 500),
    codCollectedCentavos: s.data === "delivered" && sh.cod_amount_centavos > 0 ? sh.cod_amount_centavos : null,
  });
  // In-process call to the webhook handler (see simulateFakePayment): works on previews too.
  const res = await shippingWebhook(new Request("http://internal/api/webhooks/shipping", { method: "POST", headers, body }));
  return res.ok ? { ok: true } : { ok: false, error: "The tracking update could not be recorded." };
}

/** Supplier, courier orders: the parcel was handed to the supplier's own courier; records courier and tracking number. */
export async function recordManualShipment(orderId: string, raw: Record<string, unknown>): Promise<ActionResult> {
  if (!uuid.safeParse(orderId).success) return notFound;
  const input = parseInput(manualShipmentSchema, raw);
  if (!input.ok) return input;
  const supabase = await createClient();
  const { error } = await supabase.rpc("record_manual_shipment", {
    p_order_id: orderId,
    p_carrier: input.data.carrier,
    p_carrier_name: input.data.carrierName,
    p_tracking_ref: input.data.trackingRef,
  });
  return error ? dbError(error) : { ok: true };
}

const manualUpdate = z.enum(["in_transit", "out_for_delivery", "failed_attempt"]);

/** Supplier, manually tracked shipments: progress the courier showed (delivered = markDelivered; returns go to support). */
export async function reportShipmentUpdate(orderId: string, status: string, note = ""): Promise<ActionResult> {
  if (!uuid.safeParse(orderId).success) return notFound;
  const s = manualUpdate.safeParse(status);
  if (!s.success) return { ok: false, error: "Unknown status" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("report_shipment_update", { p_order_id: orderId, p_status: s.data, p_note: String(note).slice(0, 500) });
  return error ? dbError(error) : { ok: true };
}

/** Support: a manually tracked parcel came back. Cancels the order; a stock order's online payment is refunded now. */
export async function recordParcelReturned(orderId: string, note: string): Promise<ActionResult> {
  if (!uuid.safeParse(orderId).success) return notFound;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_record_parcel_returned", { p_order_id: orderId, p_note: String(note).slice(0, 500) });
  if (error) return dbError(error);
  return data.startsWith("refund:") ? settleRefund(data.slice("refund:".length)) : { ok: true };
}
