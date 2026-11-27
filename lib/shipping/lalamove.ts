import "server-only";
import { sendWithRetry } from "./ninjavan-http";
import { createLalamoveMock, MOCK_CONFIG } from "./lalamove-mock";
import {
  CITIES_PATH,
  isConfigured,
  type LalamoveConfig,
  lalamoveConfig,
  orderBody,
  ORDERS_PATH,
  parseCities,
  parseErrorCode,
  parseOrderResponse,
  parseQuotationResponse,
  QUOTATIONS_PATH,
  quotationBody,
  requestHeaders,
  toE164PH,
  verifyWebhook,
} from "./lalamove-wire";
import { CourierError, type CourierProvider, CourierUncertainError, type Vehicle } from "./types";

// Every courier parcel is booked on TULAY's own Lalamove account (owner's decision, 2026-11-27).
// TODO(lalamove): PH vehicle keys are not documented (read from GET /v3/cities); whether one quotation can back
// only one order, the request clock-skew window and cancellation fees are not documented either.
// Wire details: lalamove-wire.ts. The booking POST is sent exactly once: Lalamove documents no idempotency.

export type LalamoveDeps = { config: LalamoveConfig; fetch: typeof fetch; now?: () => number; sleep?: (ms: number) => Promise<void> };

const UNAVAILABLE = "Lalamove booking is not available right now. Ship with your own courier or try again later.";
const VEHICLES_TTL_MS = 24 * 60 * 60 * 1000;
const BOOK_TIMEOUT_MS = 20_000;

/** A clear message for a 4xx; nothing was created. */
async function definiteMessage(res: Response, kind: "quote" | "book"): Promise<string> {
  const code = parseErrorCode(await res.clone().json().catch(() => null));
  console.error(`lalamove ${kind}`, res.status, code); // no personal data
  if (res.status === 401 || res.status === 403) return UNAVAILABLE; // TULAY's keys, not the supplier's problem
  if (res.status === 429) return "The courier is busy. Wait a minute and try again.";
  if (res.status === 402 || code === "ERR_INSUFFICIENT_CREDIT") return "Lalamove booking is not available right now (courier balance). Ship with your own courier or try again later.";
  if (code === "ERR_OUT_OF_SERVICE_AREA") return "The courier does not serve the pickup or delivery address.";
  if (code === "ERR_INVALID_SERVICE_TYPE") return "The chosen Lalamove vehicle is not available. Pick another vehicle (Company Profile, Courier pickup).";
  if (code === "ERR_INVALID_PHONE_NUMBER") return "The courier rejected a phone number. Check the pickup and delivery phone numbers.";
  if (code === "ERR_INVALID_QUOTATION_ID") return "The delivery price expired. Book again.";
  return kind === "quote" ? "The courier could not price this delivery. Check the pickup and delivery addresses." : "The courier rejected the booking. Check the pickup and delivery details.";
}

export function createLalamoveCourier(getDeps: () => LalamoveDeps) {
  // shortcut: per-instance cache, so each server instance asks Lalamove once a day; share it (database) if vehicle lists get large.
  let vehicleCache: { at: number; list: Vehicle[] } | null = null;

  const call = (d: LalamoveDeps, method: string, path: string, body?: string, signal?: AbortSignal) => {
    const headers = requestHeaders(d.config, method, path, body ?? "", (d.now ?? Date.now)());
    return d.fetch(`${d.config.apiBase}${path}`, { method, headers, body, signal });
  };

  return {
    name: "lalamove" as const,

    async quote(input) {
      const d = getDeps();
      if (!isConfigured(d.config)) throw new CourierError("Lalamove booking is not available yet.");
      if (!input.serviceType) throw new CourierError("Pick a Lalamove vehicle first (Company Profile, Courier pickup).");
      const body = JSON.stringify(quotationBody({ ...input, serviceType: input.serviceType }));
      // A quote creates nothing, so 5xx and network failures may be retried.
      const res = await sendWithRetry(() => call(d, "POST", QUOTATIONS_PATH, body, AbortSignal.timeout(8000)), { label: "lalamove quote", sleep: d.sleep }).catch(() => {
        throw new CourierError("The courier is not answering. Try again in a minute.");
      });
      if (!res.ok) throw new CourierError(await definiteMessage(res, "quote"));
      const quote = parseQuotationResponse(await res.json().catch(() => null));
      if (!quote) throw new CourierError("The courier sent a price we could not read. Try again.");
      return quote;
    },

    async vehicles() {
      const d = getDeps();
      const now = (d.now ?? Date.now)();
      if (vehicleCache && now - vehicleCache.at < VEHICLES_TTL_MS) return vehicleCache.list;
      if (!isConfigured(d.config)) throw new CourierError("Lalamove booking is not available yet.");
      const res = await sendWithRetry(() => call(d, "GET", CITIES_PATH, undefined, AbortSignal.timeout(8000)), { label: "lalamove cities", sleep: d.sleep }).catch(() => {
        throw new CourierError(UNAVAILABLE);
      });
      if (!res.ok) throw new CourierError(UNAVAILABLE);
      const list = parseCities(await res.json().catch(() => null));
      if (!list.length) throw new CourierError(UNAVAILABLE);
      vehicleCache = { at: now, list };
      return list;
    },

    async book(input) {
      const d = getDeps();
      if (!isConfigured(d.config)) throw new CourierError("Lalamove booking is not available yet.");
      if (!input.quote) throw new CourierError("Get a delivery price first, then book.");
      if (!input.pickupFrom) throw new CourierError("Add your pickup address first (Company Profile, Courier pickup).");
      const senderPhone = toE164PH(input.pickupFrom.phone);
      if (!senderPhone) throw new CourierError("Your pickup phone number is not a valid Philippine number. Fix it in Company Profile.");
      const recipientPhone = toE164PH(input.shipTo.phone);
      if (!recipientPhone) throw new CourierError("The buyer's phone number is not a valid Philippine number. Ask the buyer to fix it.");
      const body = JSON.stringify(
        orderBody({
          quote: input.quote, senderName: input.pickupFrom.name, senderPhone, recipientName: input.shipTo.recipient, recipientPhone, orderRef: input.orderRef,
        }),
      );

      let res: Response;
      try {
        // Exactly one attempt, never retried: the booking may exist even when the answer never arrives.
        res = await call(d, "POST", ORDERS_PATH, body, AbortSignal.timeout(BOOK_TIMEOUT_MS));
      } catch {
        throw new CourierUncertainError("Lalamove did not answer the booking request.");
      }
      if (res.status >= 500) throw new CourierUncertainError(`Lalamove answered ${res.status} to the booking request.`);
      if (res.status >= 400) throw new CourierError(await definiteMessage(res, "book"));
      const order = res.ok ? parseOrderResponse(await res.json().catch(() => null)) : null;
      if (!order) throw new CourierUncertainError(`Lalamove answered ${res.status} without an order id.`);
      // An unreadable, missing or zero total must never reach the ledger: fall back to the quoted price.
      const quoted = input.quote.amountCentavos;
      const booked = order.priceCentavos !== null && order.priceCentavos > 0 ? order.priceCentavos : quoted;
      if (booked > quoted) console.error("lalamove booked above quote", order.orderId, quoted, booked);
      return { trackingRef: order.orderId, priceCentavos: booked, shareLink: order.shareLink };
    },

    verifyWebhook(rawBody) {
      return verifyWebhook(rawBody, getDeps().config);
    },
  } satisfies CourierProvider;
}

// ------------------------------------------------------------------ production wiring

/** LALAMOVE_MOCK=1: local in-memory Lalamove, so booking works before the sandbox keys. */
let mock: ReturnType<typeof createLalamoveMock> | null = null;

export const lalamoveCourier = createLalamoveCourier(() => {
  if (process.env.LALAMOVE_MOCK === "1") {
    if (process.env.VERCEL_ENV === "production") throw new Error("The Lalamove mock is disabled in production");
    // The mock signs webhooks, so its secret must not be a published constant.
    const secret = process.env.FAKE_COURIER_WEBHOOK_SECRET ?? "";
    if (secret.length < 32) throw new Error("FAKE_COURIER_WEBHOOK_SECRET must be set (32+ characters) to use the Lalamove mock");
    const config = { ...MOCK_CONFIG, apiSecret: secret };
    mock ??= createLalamoveMock(config);
    return { config, fetch: mock.fetch as typeof fetch };
  }
  return { config: lalamoveConfig(), fetch };
});
