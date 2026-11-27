import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { PickupFrom, ShipmentStatus, ShipTo, TrackingEvent } from "./types";

// Everything Ninja Van-specific on the wire lives in this one file. TULAY books every courier parcel on its own
// shipper account (owner's decision, 2026-11-27), using the standard shipper API, not the plugin API.
// Paths, fields and statuses are checked against the Ninja Van API docs spec (OAuth API, Order API 4.2, webhooks V2).
// TODO(ninjavan): still unverified against a live sandbox. The base URL and credentials come from env vars.

export const TOKEN_PATH = "/2.0/oauth/access_token"; // client credentials; apiBase carries the country code
export const ORDER_PATH = "/4.2/orders";
export const DUPLICATE_TRACKING_CODE = 109201; // "Duplicate Tracking ID", answered with HTTP 400
export const SIGNATURE_HEADER = "x-ninjavan-hmac-sha256";

export type NinjaVanConfig = {
  apiBase: string; // includes the country code: sandbox https://api-sandbox.ninjavan.co/sg, production https://api.ninjavan.co/ph
  clientId: string;
  clientSecret: string; // also the webhook signing key
};

export function ninjaVanConfig(): NinjaVanConfig {
  const env = (k: string) => process.env[k] ?? "";
  return {
    apiBase: env("NINJAVAN_API_BASE").replace(/\/$/, ""),
    clientId: env("NINJAVAN_CLIENT_ID"),
    clientSecret: env("NINJAVAN_CLIENT_SECRET"),
  };
}

export const isConfigured = (c: NinjaVanConfig) => Boolean(c.apiBase && c.clientId && c.clientSecret);

export type TokenGrant = { accessToken: string; expiresAt: number }; // expiresAt: epoch ms

export const tokenRequestBody = (c: NinjaVanConfig) => ({ client_id: c.clientId, client_secret: c.clientSecret, grant_type: "client_credentials" });

export function parseTokenResponse(json: unknown, now: number): TokenGrant | null {
  const j = (json ?? {}) as Record<string, unknown>;
  if (typeof j.access_token !== "string" || !j.access_token) return null;
  // `expires` = epoch seconds; fall back to `expires_in` seconds from now.
  const expiresAt =
    typeof j.expires === "number" ? j.expires * 1000 : typeof j.expires_in === "number" ? now + j.expires_in * 1000 : null;
  return expiresAt === null ? null : { accessToken: j.access_token, expiresAt };
}

const address = (a: Omit<ShipTo, "recipient" | "phone">) => ({
  address1: a.line1,
  address2: a.line2,
  district: a.barangay,
  city: a.city,
  province: a.province,
  postcode: a.postalCode,
  country: "PH",
  address_type: "office",
});

/** Order ref "ORD-2026-00012" -> "ORD202600012": the same order always asks for the same tracking number. */
export const requestedTrackingNumber = (orderRef: string) => orderRef.replace(/[^A-Za-z0-9]/g, "").slice(0, 20);

const manilaDate = (ms: number) => new Date(ms).toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
const DAY_MS = 86_400_000;

export function orderRequestBody(input: { orderRef: string; shipTo: ShipTo; codAmountCentavos: number; sender: PickupFrom; now: number }) {
  const { sender, shipTo } = input;
  const slot = { start_time: "09:00", end_time: "18:00", timezone: "Asia/Manila" };
  const job: Record<string, unknown> = {
    is_pickup_required: true,
    pickup_service_type: "Scheduled",
    pickup_service_level: "Standard",
    pickup_date: manilaDate(input.now + DAY_MS),
    pickup_timeslot: slot,
    pickup_approximate_volume: "Less than 3 Parcels", // the docs list it with pickup_date and pickup_timeslot for Scheduled pickups
    delivery_start_date: manilaDate(input.now + DAY_MS),
    delivery_timeslot: slot,
    dimensions: { weight: sender.parcelWeightGrams / 1000 }, // kg
  };
  // Wire format is pesos; centavos stay integers everywhere else. Two decimals at most, so this is exact.
  if (input.codAmountCentavos > 0) {
    job.cash_on_delivery = input.codAmountCentavos / 100;
    job.cash_on_delivery_currency = "PHP"; // v4.2 requires the currency whenever cash_on_delivery is sent
  }
  return {
    service_type: "Parcel",
    service_level: "Standard",
    requested_tracking_number: requestedTrackingNumber(input.orderRef),
    reference: { merchant_order_number: input.orderRef },
    from: { name: sender.name, phone_number: sender.phone, address: address(sender) },
    to: { name: shipTo.recipient, phone_number: shipTo.phone, address: address(shipTo) },
    parcel_job: job,
  };
}

export function parseOrderResponse(json: unknown): string | null {
  const t = (json as Record<string, unknown> | null)?.tracking_number;
  return typeof t === "string" && t ? t : null;
}

// ------------------------------------------------------------------ webhooks

export function signBody(rawBody: string, secret: string): string {
  return createHmac("sha256", secret).update(rawBody).digest("base64");
}

export function signatureValid(rawBody: string, given: string | null, secret: string): boolean {
  if (!given || !secret) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(signBody(rawBody, secret));
  return a.length === b.length && timingSafeEqual(a, b);
}

// Ninja Van V2 webhook status -> our status. Matched case-insensitively on the start of the text.
// Anything else (pending pickup, pickup exceptions, cancelled, PUDO, measurements) is acknowledged and ignored.
const STATUS_MAP: [string, Exclude<ShipmentStatus, "booked">][] = [
  ["picked up", "picked_up"],
  ["arrived at origin hub", "in_transit"],
  ["arrived at transit hub", "in_transit"],
  ["arrived at destination hub", "in_transit"],
  ["in transit to next sorting hub", "in_transit"],
  ["on vehicle for delivery", "out_for_delivery"],
  ["delivered", "delivered"],
  ["delivery exception", "failed_attempt"],
  ["returned to sender", "returned"],
];

export function mapStatus(text: string): Exclude<ShipmentStatus, "booked"> | null {
  const t = text.trim().toLowerCase();
  return STATUS_MAP.find(([prefix]) => t.startsWith(prefix))?.[1] ?? null;
}

/** Parsed webhook: an event, "ignored" (authentic but not one we track), or null (malformed). */
export function parseWebhook(rawBody: string): TrackingEvent | "ignored" | null {
  let j: Record<string, unknown>;
  try {
    j = JSON.parse(rawBody);
  } catch {
    return null;
  }
  const trackingRef = [j.tracking_id, j.tracking_number, j.tracking_ref_no].find((v) => typeof v === "string" && v);
  if (typeof trackingRef !== "string" || typeof j.status !== "string") return null;
  // On the return leg only "Returned to Sender" counts: hub scans and "On Vehicle for Delivery" must not tell the buyer it is out for delivery.
  const status = j.is_parcel_on_rts_leg === true && !j.status.trim().toLowerCase().startsWith("returned to sender") ? null : mapStatus(j.status);
  if (!status) return "ignored";
  const occurred = typeof j.timestamp === "string" ? Date.parse(j.timestamp) : NaN;
  return {
    // No event id in the payload = hash of the body, so a redelivery of the same body is still a duplicate.
    id: typeof j.id === "string" && j.id ? j.id.slice(0, 100) : `nv_${createHash("sha256").update(rawBody).digest("hex").slice(0, 40)}`,
    trackingRef: trackingRef.slice(0, 100),
    status,
    occurredAt: new Date(Number.isNaN(occurred) ? Date.now() : occurred).toISOString(),
    note: (typeof j.event === "string" && j.event ? j.event : j.status).slice(0, 500),
    // V2 delivered payloads carry no COD amount in the docs, so null
    // (cod_remittances gets no row and finance reconciles from the supplier's Ninja Van statement).
    codCollectedCentavos: null,
  };
}
