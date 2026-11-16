import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { PickupFrom, ShipmentStatus, ShipTo, TrackingEvent } from "./types";

// Everything Ninja Van-specific on the wire lives in this one file.
// TODO(ninjavan): VERIFY EVERY PATH, FIELD AND STATUS BELOW against the Ninja Van PH API docs before the audit.
// They follow Ninja Van's public v4.2 API as recalled, not a document we hold. Base URLs, the authorize URL and
// scopes come from env vars (set from the docs), never hardcoded.

export const TOKEN_PATH = "/2.0/oauth/access_token";
export const ORDER_PATH = "/4.2/orders";
export const SIGNATURE_HEADER = "x-ninjavan-hmac-sha256";

export type NinjaVanConfig = {
  apiBase: string; // e.g. sandbox https://api-sandbox.ninjavan.co/SG
  authorizeUrl: string; // Ninja Dash consent page
  clientId: string;
  clientSecret: string;
  scopes: string; // space-separated
  redirectUri: string;
};

export function ninjaVanConfig(): NinjaVanConfig {
  const env = (k: string) => process.env[k] ?? "";
  const cfg = {
    apiBase: env("NINJAVAN_API_BASE").replace(/\/$/, ""),
    authorizeUrl: env("NINJAVAN_AUTHORIZE_URL"),
    clientId: env("NINJAVAN_CLIENT_ID"),
    clientSecret: env("NINJAVAN_CLIENT_SECRET"),
    scopes: env("NINJAVAN_SCOPES"),
    redirectUri: `${env("NEXT_PUBLIC_SITE_URL") || "http://127.0.0.1:3000"}/api/ninjavan/callback`,
  };
  return cfg;
}

export const isConfigured = (c: NinjaVanConfig) => Boolean(c.apiBase && c.authorizeUrl && c.clientId && c.clientSecret);

/** Consent page URL: client id, space-separated scopes, state (Ninja Van plugin OAuth). */
export function authorizeUrl(c: NinjaVanConfig, state: string): string {
  const u = new URL(c.authorizeUrl);
  u.searchParams.set("client_id", c.clientId);
  u.searchParams.set("scope", c.scopes);
  u.searchParams.set("state", state);
  u.searchParams.set("redirect_uri", c.redirectUri);
  u.searchParams.set("response_type", "code");
  return u.toString();
}

export type TokenGrant = { accessToken: string; refreshToken: string; expiresAt: number; scopes: string | null };

export function tokenRequestBody(c: NinjaVanConfig, grant: { code: string } | { refreshToken: string }) {
  return "code" in grant
    ? { client_id: c.clientId, client_secret: c.clientSecret, grant_type: "authorization_code", code: grant.code, redirect_uri: c.redirectUri }
    : { client_id: c.clientId, client_secret: c.clientSecret, grant_type: "refresh_token", refresh_token: grant.refreshToken };
}

export function parseTokenResponse(json: unknown, now: number): TokenGrant | null {
  const j = (json ?? {}) as Record<string, unknown>;
  if (typeof j.access_token !== "string" || !j.access_token) return null;
  // `expires` = epoch seconds; fall back to `expires_in` seconds from now.
  const expiresAt =
    typeof j.expires === "number" ? j.expires * 1000 : typeof j.expires_in === "number" ? now + j.expires_in * 1000 : null;
  if (expiresAt === null) return null;
  return {
    accessToken: j.access_token,
    refreshToken: typeof j.refresh_token === "string" ? j.refresh_token : "",
    expiresAt,
    scopes: typeof j.scope === "string" ? j.scope : null,
  };
}


const address = (a: Omit<ShipTo, "recipient" | "phone">) => ({
  address1: a.line1,
  address2: [a.line2, a.barangay].filter(Boolean).join(", "),
  city: a.city,
  state: a.province,
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
    delivery_start_date: manilaDate(input.now + DAY_MS),
    delivery_timeslot: slot,
    dimensions: { weight: sender.parcelWeightGrams / 1000 }, // kg
  };
  // Wire format is pesos; centavos stay integers everywhere else. Two decimals at most, so this is exact.
  if (input.codAmountCentavos > 0) job.cash_on_delivery = input.codAmountCentavos / 100;
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

// Ninja Van status text -> our status. Matched case-insensitively on the start of the text.
// Anything else (pending pickup, cancelled, hub scans we don't track) is acknowledged and ignored.
const STATUS_MAP: [string, Exclude<ShipmentStatus, "booked">][] = [
  ["successful pickup", "picked_up"],
  ["picked up", "picked_up"],
  ["en-route to sorting hub", "in_transit"],
  ["arrived at sorting hub", "in_transit"],
  ["arrived at origin hub", "in_transit"],
  ["in transit", "in_transit"],
  ["on vehicle for delivery", "out_for_delivery"],
  ["out for delivery", "out_for_delivery"],
  ["successful delivery", "delivered"],
  ["delivered", "delivered"],
  ["pending reschedule", "failed_attempt"],
  ["first attempt delivery fail", "failed_attempt"],
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
  const status = mapStatus(j.status);
  if (!status) return "ignored";
  const occurred = typeof j.timestamp === "string" ? Date.parse(j.timestamp) : NaN;
  return {
    // No event id in the payload = hash of the body, so a redelivery of the same body is still a duplicate.
    id: typeof j.id === "string" && j.id ? j.id.slice(0, 100) : `nv_${createHash("sha256").update(rawBody).digest("hex").slice(0, 40)}`,
    trackingRef: trackingRef.slice(0, 100),
    status,
    occurredAt: new Date(Number.isNaN(occurred) ? Date.now() : occurred).toISOString(),
    note: j.status.slice(0, 500),
    // TODO(ninjavan): confirm whether delivered webhooks carry the COD amount collected; until then null
    // (cod_remittances gets no row and finance reconciles from the supplier's Ninja Van statement).
    codCollectedCentavos: null,
  };
}
