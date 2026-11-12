"use server";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { type ActionResult, dbError, parseInput } from "@/lib/action-result";
import { getCourier } from "@/lib/shipping";
import { signFakeTracking } from "@/lib/shipping/fake";
import { createClient } from "@/lib/supabase/server";
import { addressSchema } from "@/lib/validation/forms";

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
    .select("ref, ship_to, payment_option, total_centavos, paid_online_centavos, fulfilment_mode")
    .eq("id", orderId)
    .maybeSingle();
  if (!o || o.fulfilment_mode !== "courier" || !o.ship_to) return { ok: false, error: "This order is not delivered by courier" };
  const courier = getCourier();
  const booked = await courier.book({
    orderRef: o.ref,
    shipTo: o.ship_to as never,
    codAmountCentavos: o.payment_option === "cod" ? o.total_centavos - o.paid_online_centavos : 0,
  });
  const { error } = await supabase.rpc("record_shipment", { p_order_id: orderId, p_carrier: courier.name, p_tracking_ref: booked.trackingRef });
  return error ? dbError(error) : { ok: true };
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
  const { data: sh } = await supabase.from("shipments").select("cod_amount_centavos").eq("tracking_ref", trackingRef).maybeSingle();
  if (!sh) return notFound;
  const { body, headers } = signFakeTracking({
    id: `trk_${randomUUID()}`,
    trackingRef,
    status: s.data,
    occurredAt: new Date().toISOString(),
    note: String(note).slice(0, 500),
    codCollectedCentavos: s.data === "delivered" && sh.cod_amount_centavos > 0 ? sh.cod_amount_centavos : null,
  });
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://127.0.0.1:3000";
  const res = await fetch(`${site}/api/webhooks/shipping`, { method: "POST", headers, body });
  return res.ok ? { ok: true } : { ok: false, error: "The tracking update could not be recorded." };
}
