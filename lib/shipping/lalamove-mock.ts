import "server-only";
import { createHmac, randomInt, randomUUID } from "node:crypto";
import { CITIES_PATH, type LalamoveConfig, ORDERS_PATH, QUOTATIONS_PATH, requestSignature } from "./lalamove-wire";

// In-memory stand-in for Lalamove (same wire shapes as lalamove-wire.ts). Used by tests, and locally when
// LALAMOVE_MOCK=1. It verifies the request signature on every call. Never used in production.

export const MOCK_CONFIG: LalamoveConfig = {
  apiBase: "https://lalamove.mock",
  apiKey: "pk_test_mock",
  apiSecret: "sk_test_mock_secret",
  market: "PH",
  webhookPath: "/api/webhooks/shipping",
};

export type MockCall = { method: string; path: string; status: number; body: unknown };

// MOCK vehicles; the real keys and loads come from GET /v3/cities.
const VEHICLES = [
  { key: "MOTORCYCLE", description: "Motorcycle (MOCK vehicle)", load: { value: "20", unit: "kg" }, mult: 1 },
  { key: "MPV", description: "MPV (MOCK vehicle)", load: { value: "200", unit: "kg" }, mult: 2 },
  { key: "VAN", description: "Van (MOCK vehicle)", load: { value: "600", unit: "kg" }, mult: 4 },
];

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

type Quotation = { total: number; expiresAt: number; used: boolean; stopIds: [string, string] };

export function createLalamoveMock(config: LalamoveConfig = MOCK_CONFIG) {
  const quotations = new Map<string, Quotation>();
  const calls: MockCall[] = [];
  const failures: (number | "timeout")[] = [];
  let multiplier = 1;

  const reply = (method: string, path: string, status: number, body: unknown) => {
    calls.push({ method, path, status, body });
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  };

  const mockFetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input : input.url);
    const method = (init?.method ?? "GET").toUpperCase();
    const path = url.pathname;
    const raw = String(init?.body ?? "");
    const headers = new Headers(init?.headers);

    const [key, ms, sig] = (headers.get("authorization") ?? "").replace(/^hmac /, "").split(":");
    const signed = method === "GET" || method === "DELETE" ? "" : raw;
    const authentic =
      key === config.apiKey && sig === requestSignature(config.apiSecret, ms ?? "", method, path, signed) &&
      headers.get("market") === config.market && Boolean(headers.get("request-id"));
    if (!authentic) return reply(method, path, 401, { message: "ERR_UNAUTHORIZED" });

    type Stop = { coordinates: { lat: string; lng: string } };
    const data = ((raw ? JSON.parse(raw) : {}) as { data?: { serviceType?: string; stops?: Stop[]; quotationId?: string; metadata?: unknown } }).data ?? {};

    if (method === "GET" && path === CITIES_PATH) {
      const services = VEHICLES.map((v) => ({ key: v.key, description: v.description, load: v.load }));
      return reply(method, path, 200, { data: [{ locode: "PH MNL", name: "Mock Manila", services }] });
    }

    if (method === "POST" && path === QUOTATIONS_PATH) {
      const vehicle = VEHICLES.find((v) => v.key === data.serviceType);
      if (!vehicle) return reply(method, path, 422, { message: "ERR_INVALID_SERVICE_TYPE" });
      const [a, b] = data.stops ?? [];
      if (!a || !b) return reply(method, path, 422, { message: "ERR_INSUFFICIENT_STOPS" });
      const km = haversineKm(
        { lat: Number(a.coordinates.lat), lng: Number(a.coordinates.lng) },
        { lat: Number(b.coordinates.lat), lng: Number(b.coordinates.lng) },
      );
      const total = Math.round((49 + 6 * km) * vehicle.mult * multiplier);
      const id = String(randomInt(1e9, 9e9)) + String(randomInt(1e9, 9e9));
      const stopIds: [string, string] = [String(randomInt(1e8, 9e8)), String(randomInt(1e8, 9e8))];
      const expiresAt = Date.now() + 5 * 60_000;
      quotations.set(id, { total, expiresAt, used: false, stopIds });
      return reply(method, path, 201, {
        data: {
          quotationId: id,
          expiresAt: new Date(expiresAt).toISOString(),
          serviceType: data.serviceType,
          stops: stopIds.map((stopId, i) => ({ stopId, ...(data.stops?.[i] ?? {}) })),
          priceBreakdown: { total: String(total), currency: "PHP" },
        },
      });
    }

    if (method === "POST" && path === ORDERS_PATH) {
      const fail = failures.shift();
      if (fail === "timeout") {
        calls.push({ method, path, status: 0, body: data });
        throw new DOMException("The operation timed out.", "TimeoutError");
      }
      if (fail) return reply(method, path, fail, { message: fail === 402 ? "ERR_INSUFFICIENT_CREDIT" : "ERR_MOCK_FAILURE" });
      const q = quotations.get(String(data.quotationId));
      if (!q || q.used || q.expiresAt < Date.now()) return reply(method, path, 422, { message: "ERR_INVALID_QUOTATION_ID" });
      q.used = true;
      const orderId = String(randomInt(1e8, 9e8)) + String(randomInt(1e9, 9e9));
      return reply(method, path, 201, {
        data: {
          orderId: orderId.padEnd(19, "0").slice(0, 19),
          quotationId: data.quotationId,
          priceBreakdown: { total: String(q.total), currency: "PHP" },
          shareLink: `https://share.lalamove.mock/${orderId}`,
          status: "ASSIGNING_DRIVER",
          metadata: data.metadata,
        },
      });
    }

    return reply(method, path, 404, { message: "ERR_NOT_FOUND" });
  };

  return {
    fetch: mockFetch,
    calls,
    /** Answer the next order calls with these HTTP statuses, or "timeout" (fetch throws). */
    failNextOrders: (...statuses: (number | "timeout")[]) => failures.push(...statuses),
    /** Scales every later quotation price (to test a price change between quotes). */
    setPriceMultiplier: (n: number) => void (multiplier = n),
    /** A webhook the way Lalamove sends it: envelope signed over `${ts}\r\nPOST\r\n${path}\r\n\r\n${JSON.stringify(data)}`. */
    webhook(eventType: string, data: Record<string, unknown>, overrides: { apiKey?: string } = {}) {
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = createHmac("sha256", config.apiSecret)
        .update(`${timestamp}\r\nPOST\r\n${config.webhookPath}\r\n\r\n${JSON.stringify(data)}`)
        .digest("hex");
      const body = JSON.stringify({
        apiKey: overrides.apiKey ?? config.apiKey, timestamp, signature, eventId: randomUUID().toUpperCase(), eventType, eventVersion: "v3", data,
      });
      return { body, headers: new Headers({ "content-type": "application/json" }) };
    },
  };
}

export type LalamoveMock = ReturnType<typeof createLalamoveMock>;
