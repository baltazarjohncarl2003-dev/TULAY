import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { toCentavos } from "@/lib/format";
import type { CourierAction, CourierQuote, QuoteInput, TrackingEvent } from "./types";

// Everything Lalamove-specific on the wire lives in this one file (API v3, verified facts in the build notes).
// TULAY books every courier parcel on its own Lalamove account. The base URL excludes /v3; paths include it.

export type LalamoveConfig = {
  apiBase: string; // https://rest.sandbox.lalamove.com or https://rest.lalamove.com (no /v3)
  apiKey: string;
  apiSecret: string; // also the webhook signing key
  market: string; // UN/LOCODE country, "PH"
  webhookPath: string; // URL path of our webhook, signed into every webhook
};

export const QUOTATIONS_PATH = "/v3/quotations";
export const ORDERS_PATH = "/v3/orders";
export const CITIES_PATH = "/v3/cities";

export function lalamoveConfig(): LalamoveConfig {
  const env = (k: string) => process.env[k] ?? "";
  return {
    apiBase: env("LALAMOVE_API_BASE").replace(/\/$/, ""),
    apiKey: env("LALAMOVE_API_KEY"),
    apiSecret: env("LALAMOVE_API_SECRET"),
    market: env("LALAMOVE_MARKET") || "PH",
    webhookPath: env("LALAMOVE_WEBHOOK_PATH") || "/api/webhooks/shipping",
  };
}

export const isConfigured = (c: LalamoveConfig) => Boolean(c.apiBase && c.apiKey && c.apiSecret);

// ------------------------------------------------------------------ request signing

const hmacHex = (secret: string, raw: string) => createHmac("sha256", secret).update(raw).digest("hex");

/** Lowercase-hex HMAC-SHA256 over `${ms}\r\n${METHOD}\r\n${path}\r\n\r\n${body}`; GET/DELETE sign an empty body. */
export function requestSignature(secret: string, ms: string, method: string, path: string, body: string): string {
  return hmacHex(secret, `${ms}\r\n${method}\r\n${path}\r\n\r\n${body}`);
}

export function requestHeaders(c: LalamoveConfig, method: string, path: string, body: string, nowMs: number): Record<string, string> {
  const ms = String(nowMs);
  const signed = method === "GET" || method === "DELETE" ? "" : body;
  return {
    "content-type": "application/json",
    authorization: `hmac ${c.apiKey}:${ms}:${requestSignature(c.apiSecret, ms, method, path, signed)}`,
    market: c.market,
    "request-id": randomUUID(),
  };
}

// ------------------------------------------------------------------ bodies

const coord = (n: number) => n.toFixed(6); // the API wants coordinates as strings

export function quotationBody(i: QuoteInput & { serviceType: string }) {
  const stop = (s: QuoteInput["pickup"]) => ({ coordinates: { lat: coord(s.lat), lng: coord(s.lng) }, address: s.address });
  return { data: { serviceType: i.serviceType, language: "en_PH", stops: [stop(i.pickup), stop(i.dropoff)] } };
}

export function orderBody(i: {
  quote: CourierQuote; senderName: string; senderPhone: string; recipientName: string; recipientPhone: string; orderRef: string;
}) {
  return {
    data: {
      quotationId: i.quote.ref,
      sender: { stopId: i.quote.stopRefs[0], name: i.senderName, phone: i.senderPhone },
      recipients: [{ stopId: i.quote.stopRefs[1], name: i.recipientName, phone: i.recipientPhone, remarks: `TULAY order ${i.orderRef}` }],
      isPODEnabled: true,
      metadata: { orderRef: i.orderRef },
    },
  };
}

// ------------------------------------------------------------------ responses

const wrongCurrency = (breakdown: unknown) => {
  const c = obj(breakdown).currency;
  return c !== undefined && c !== "PHP";
};

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

/** Price strings are whole pesos or have decimals ("124", "124.50"); never parsed as floats. */
function priceToCentavos(v: unknown): number | null {
  if (typeof v !== "string") return null;
  try {
    return toCentavos(v);
  } catch {
    return null;
  }
}

export function parseQuotationResponse(json: unknown): CourierQuote | null {
  const d = obj(obj(json).data);
  if (wrongCurrency(d.priceBreakdown)) return null;
  const amount = priceToCentavos(obj(d.priceBreakdown).total);
  const stops = Array.isArray(d.stops) ? d.stops.map((s) => { const id = obj(s).stopId; return typeof id === "number" ? String(id) : id; }) : [];
  if (typeof d.quotationId !== "string" || !d.quotationId || typeof d.expiresAt !== "string" || !amount || amount <= 0) return null;
  if (stops.length !== 2 || stops.some((s) => typeof s !== "string" || !s)) return null;
  return { ref: d.quotationId, amountCentavos: amount, expiresAt: d.expiresAt, stopRefs: [stops[0] as string, stops[1] as string] };
}

export function parseOrderResponse(json: unknown): { orderId: string; priceCentavos: number | null; shareLink: string | null } | null {
  const d = obj(obj(json).data);
  if (typeof d.orderId !== "string" || !d.orderId || wrongCurrency(d.priceBreakdown)) return null;
  return {
    orderId: d.orderId,
    priceCentavos: priceToCentavos(obj(d.priceBreakdown).total),
    // Shown as a link on order pages and stored in shipments.share_link (max 500): anything else is dropped, never fatal.
    shareLink: typeof d.shareLink === "string" && d.shareLink.startsWith("https://") && d.shareLink.length <= 500 ? d.shareLink : null,
  };
}

/** Error code from either shape: `{message: "ERR_X"}` or `{errors: [{id, message, detail}]}`. "" when unreadable. */
export function parseErrorCode(json: unknown): string {
  const j = obj(json);
  if (typeof j.message === "string") return j.message;
  const first = Array.isArray(j.errors) ? obj(j.errors[0]) : {};
  return typeof first.id === "string" ? first.id : typeof first.message === "string" ? first.message : "";
}

/** Philippine number to E.164 (+63...); null when it does not look like one. */
export function toE164PH(phone: string): string | null {
  const s = phone.replace(/[\s\-().]/g, "");
  const e164 = s.startsWith("+63") ? s : s.startsWith("63") ? `+${s}` : s.startsWith("0") ? `+63${s.slice(1)}` : "";
  return /^\+63\d{9,10}$/.test(e164) ? e164 : null;
}

export type CityService = { key: string; description: string; loadKg: number | null };

/** services[] across all cities, deduplicated by key. */
export function parseCities(json: unknown): CityService[] {
  const out = new Map<string, CityService>();
  for (const city of Array.isArray(obj(json).data) ? (obj(json).data as unknown[]) : []) {
    for (const raw of Array.isArray(obj(city).services) ? (obj(city).services as unknown[]) : []) {
      const s = obj(raw);
      if (typeof s.key !== "string" || !s.key || out.has(s.key)) continue;
      const load = obj(s.load);
      const kg = load.unit === "kg" ? Number(load.value) : NaN;
      out.set(s.key, { key: s.key, description: typeof s.description === "string" ? s.description : "", loadKg: Number.isFinite(kg) ? kg : null });
    }
  }
  return [...out.values()];
}

// ------------------------------------------------------------------ webhooks

/**
 * Verifies a webhook envelope and maps it. null when not authentic, "ignored" for events we don't track.
 * Signature: HMAC-SHA256(secret, `${timestamp}\r\nPOST\r\n${path}\r\n\r\n${JSON.stringify(data)}`), lowercase hex.
 * The caller answers an empty body with 200 before calling this.
 */
export function verifyWebhook(rawBody: string, c: LalamoveConfig): TrackingEvent | CourierAction | "ignored" | null {
  let env: Record<string, unknown>;
  try {
    env = obj(JSON.parse(rawBody));
  } catch {
    return null;
  }
  const { apiKey, timestamp, signature, eventId, eventType, data } = env;
  if (!c.apiKey || !c.apiSecret || apiKey !== c.apiKey) return null;
  if (typeof signature !== "string" || typeof eventId !== "string" || !eventId || typeof eventType !== "string") return null;
  if ((typeof timestamp !== "number" && typeof timestamp !== "string") || !data || typeof data !== "object") return null;
  // TODO(lalamove): the docs sign JSON.stringify(data) but do not promise Lalamove's bytes match a re-stringify
  // (key order, spacing); the docs sample verified in JS. Also undocumented: query string in the path, replay window.
  const expected = Buffer.from(hmacHex(c.apiSecret, `${timestamp}\r\nPOST\r\n${c.webhookPath}\r\n\r\n${JSON.stringify(data)}`), "hex");
  const given = Buffer.from(signature, "hex");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  return mapEvent(eventId, eventType, obj(data), timestamp);
}

function mapEvent(id: string, eventType: string, data: Record<string, unknown>, timestamp: number | string): TrackingEvent | CourierAction | "ignored" {
  const order = obj(data.order);
  const trackingRef = typeof order.orderId === "string" ? order.orderId : "";
  if (!trackingRef) return "ignored";

  if (eventType === "ORDER_REPLACED") {
    return typeof data.prevOrderId === "string" && data.prevOrderId
      ? { kind: "replace", id, trackingRef: data.prevOrderId, newTrackingRef: trackingRef }
      : "ignored";
  }
  if (eventType !== "ORDER_STATUS_CHANGED") return "ignored";

  const status = order.status;
  if (status === "PICKED_UP" || status === "COMPLETED") {
    const at = typeof data.updatedAt === "string" ? Date.parse(data.updatedAt) : NaN;
    const ms = Number.isNaN(at) ? Number(timestamp) * 1000 : at;
    const when = new Date(Number.isFinite(ms) ? ms : Date.now());
    return {
      id,
      trackingRef,
      status: status === "PICKED_UP" ? "picked_up" : "delivered",
      occurredAt: (Number.isNaN(when.getTime()) ? new Date() : when).toISOString(),
      note: "",
      codCollectedCentavos: null,
    };
  }
  if (status === "EXPIRED" || status === "REJECTED") return { kind: "void", id, trackingRef, reason: `Lalamove ${status.toLowerCase()} the order` };
  if (status === "CANCELED") {
    // TODO(lalamove): the docs screenshots do not make clear whether cancelParty/cancelReason sit on data.order or data; read both.
    const who = String([order.cancelParty, data.cancelParty].find((v) => typeof v === "string") ?? "unknown").slice(0, 200);
    const why = String([order.cancelReason, data.cancelReason].find((v) => typeof v === "string") ?? "none given").slice(0, 200);
    // Support checks the Lalamove dashboard: a cancel can be followed by ORDER_REPLACED (cancel and clone).
    return { kind: "flag", id, trackingRef, note: `Lalamove canceled the order (cancelParty: ${who}, cancelReason: ${why}). Check the Lalamove dashboard before voiding.` };
  }
  return "ignored"; // ASSIGNING_DRIVER, ON_GOING and anything new
}
