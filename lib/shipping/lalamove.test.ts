import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createLalamoveCourier } from "./lalamove";
import { createLalamoveMock, type LalamoveMock, MOCK_CONFIG } from "./lalamove-mock";
import { orderBody, parseOrderResponse, parseQuotationResponse, requestHeaders, requestSignature, toE164PH } from "./lalamove-wire";
import { type BookInput, CourierError, type CourierQuote, CourierUncertainError, type PickupFrom, type QuoteInput } from "./types";

const pickupFrom: PickupFrom = {
  name: "Ship Co", phone: "0917 123 4567", line1: "1 Shaw Blvd", line2: "", barangay: "Wack-Wack",
  city: "Mandaluyong", province: "Metro Manila", postalCode: "1550", parcelWeightGrams: 800, serviceType: "MOTORCYCLE",
};
const shipTo = {
  recipient: "Juan Buyer", phone: "09181234567", line1: "2 Ayala Ave", line2: "", barangay: "Poblacion",
  city: "Makati", province: "Metro Manila", postalCode: "1210",
};
const quoteInput: QuoteInput = {
  pickup: { lat: 14.5836, lng: 121.0409, address: "1 Shaw Blvd, Mandaluyong" },
  dropoff: { lat: 14.5547, lng: 121.0244, address: "2 Ayala Ave, Makati" },
  serviceType: "MOTORCYCLE",
};

let mock: LalamoveMock;
let courier: ReturnType<typeof createLalamoveCourier>;
const sleep = async () => {};

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  mock = createLalamoveMock();
  courier = createLalamoveCourier(() => ({ config: MOCK_CONFIG, fetch: mock.fetch as typeof fetch, sleep }));
});

const book = (quote: CourierQuote, over: Partial<BookInput> = {}): BookInput => ({ orderRef: "ORD-2026-00001", shipTo, codAmountCentavos: 0, pickupFrom, quote, ...over });
const orderPosts = () => mock.calls.filter((c) => c.method === "POST" && c.path === "/v3/orders");

describe("Lalamove request signing", () => {
  it("signs ms, method, path and body with HMAC-SHA256 lowercase hex", () => {
    const body = '{"data":{"a":1}}';
    const expected = createHmac("sha256", "sk").update(`1545880607433\r\nPOST\r\n/v3/quotations\r\n\r\n${body}`).digest("hex");
    expect(requestSignature("sk", "1545880607433", "POST", "/v3/quotations", body)).toBe(expected);
    expect(expected).toMatch(/^[0-9a-f]{64}$/);
  });

  it("sends Authorization, Market and Request-ID; GET signs an empty body", () => {
    const h = requestHeaders({ ...MOCK_CONFIG, apiKey: "pk", apiSecret: "sk" }, "GET", "/v3/cities", "ignored", 1545880607433);
    const sig = createHmac("sha256", "sk").update("1545880607433\r\nGET\r\n/v3/cities\r\n\r\n").digest("hex");
    expect(h.authorization).toBe(`hmac pk:1545880607433:${sig}`);
    expect(h.market).toBe("PH");
    expect(h["request-id"]).toMatch(/^[0-9a-f-]{36}$/);
    expect(h["content-type"]).toBe("application/json");
  });

  it("is rejected by the mock when the secret is wrong", async () => {
    const bad = createLalamoveCourier(() => ({ config: { ...MOCK_CONFIG, apiSecret: "wrong" }, fetch: mock.fetch as typeof fetch, sleep }));
    await expect(bad.quote(quoteInput)).rejects.toThrow(/not available right now/);
    expect(mock.calls.map((c) => c.status)).toEqual([401]);
  });
});

describe("Lalamove prices and bodies", () => {
  it("turns price strings into centavos without floats", () => {
    const parse = (total: string) =>
      parseQuotationResponse({ data: { quotationId: "q", expiresAt: "2026-11-27T00:00:00Z", stops: [{ stopId: "1" }, { stopId: "2" }], priceBreakdown: { total } } })?.amountCentavos;
    expect(parse("124")).toBe(12400);
    expect(parse("124.50")).toBe(12450);
    expect(parse("abc")).toBeUndefined();
    const usd = { quotationId: "q", expiresAt: "x", stops: [{ stopId: 1 }, { stopId: "2" }], priceBreakdown: { total: "124", currency: "USD" } };
    expect(parseQuotationResponse({ data: usd })).toBeNull();
    expect(parseQuotationResponse({ data: { ...usd, priceBreakdown: { total: "124", currency: "PHP" } } })?.stopRefs).toEqual(["1", "2"]);
    expect(parseOrderResponse({ data: { orderId: "1", priceBreakdown: { total: "1", currency: "USD" } } })).toBeNull();
    expect(parseOrderResponse({ data: { orderId: "1", priceBreakdown: { total: "124.50" } } })?.priceCentavos).toBe(12450);
    const link = (shareLink: string) => parseOrderResponse({ data: { orderId: "1", shareLink } })?.shareLink;
    expect(link("https://share.lalamove.com/x")).toBe("https://share.lalamove.com/x");
    expect(link(`https://share.lalamove.com/${"x".repeat(500)}`)).toBeNull(); // too long for shipments.share_link
    expect(link("javascript:alert(1)")).toBeNull();
  });

  it("builds the order body from the quote", () => {
    const quote: CourierQuote = { ref: "q1", amountCentavos: 100, expiresAt: "x", stopRefs: ["s1", "s2"] };
    expect(orderBody({ quote, senderName: "A", senderPhone: "+639171234567", recipientName: "B", recipientPhone: "+639181234567", orderRef: "ORD-1" }).data).toEqual({
      quotationId: "q1",
      sender: { stopId: "s1", name: "A", phone: "+639171234567" },
      recipients: [{ stopId: "s2", name: "B", phone: "+639181234567", remarks: "TULAY order ORD-1" }],
      isPODEnabled: true,
      metadata: { orderRef: "ORD-1" },
    });
  });

  it("converts Philippine phone numbers to E.164", () => {
    expect(toE164PH("09171234567")).toBe("+639171234567");
    expect(toE164PH("0917-123-4567")).toBe("+639171234567");
    expect(toE164PH("639171234567")).toBe("+639171234567");
    expect(toE164PH("+639171234567")).toBe("+639171234567");
    expect(toE164PH("+63 917 123 4567")).toBe("+639171234567");
    expect(toE164PH("02 8123 4567")).toBe("+63281234567");
    expect(toE164PH("12345")).toBeNull();
    expect(toE164PH("+14155550100")).toBeNull();
    expect(toE164PH("")).toBeNull();
  });
});

describe("Lalamove quote", () => {
  it("prices by distance in whole pesos", async () => {
    const q = await courier.quote(quoteInput);
    expect(q.amountCentavos).toBeGreaterThan(4900);
    expect(q.amountCentavos % 100).toBe(0);
    expect(q.stopRefs).toHaveLength(2);
    expect(mock.calls[0].path).toBe("/v3/quotations");
  });

  it("asks for a vehicle first and rejects unknown vehicles", async () => {
    await expect(courier.quote({ ...quoteInput, serviceType: null })).rejects.toThrow(/Pick a Lalamove vehicle first/);
    await expect(courier.quote({ ...quoteInput, serviceType: "SPACESHIP" })).rejects.toThrow(/vehicle/);
  });

  it("retries 5xx", async () => {
    let n = 0;
    const flaky = createLalamoveCourier(() => ({
      config: MOCK_CONFIG,
      fetch: (async (...a: Parameters<typeof fetch>) => (++n < 3 ? new Response("{}", { status: 503 }) : mock.fetch(...a))) as typeof fetch,
      sleep,
    }));
    await expect(flaky.quote(quoteInput)).resolves.toMatchObject({ stopRefs: expect.any(Array) });
    expect(n).toBe(3);
  });
});

describe("Lalamove booking", () => {
  it("books once at the quoted price", async () => {
    const q = await courier.quote(quoteInput);
    const b = await courier.book(book(q));
    expect(b.trackingRef).toMatch(/^\d{19}$/);
    expect(b.priceCentavos).toBe(q.amountCentavos);
    expect(b.shareLink).toMatch(/^https:\/\/share\.lalamove\.mock\//);
    expect(orderPosts()).toHaveLength(1);
  });

  it("needs a quote, a pickup and valid phones before calling Lalamove", async () => {
    const q = await courier.quote(quoteInput);
    await expect(courier.book({ ...book(q), quote: undefined })).rejects.toThrow(CourierError);
    await expect(courier.book(book(q, { pickupFrom: null }))).rejects.toThrow(/pickup address/);
    await expect(courier.book(book(q, { pickupFrom: { ...pickupFrom, phone: "123" } }))).rejects.toThrow(/pickup phone/);
    await expect(courier.book(book(q, { shipTo: { ...shipTo, phone: "123" } }))).rejects.toThrow(/buyer's phone/);
    expect(orderPosts()).toHaveLength(0);
  });

  it("sends exactly ONE POST on 503 and throws CourierUncertainError", async () => {
    const q = await courier.quote(quoteInput);
    mock.failNextOrders(503);
    await expect(courier.book(book(q))).rejects.toThrow(CourierUncertainError);
    expect(orderPosts()).toHaveLength(1);
  });

  it("treats a timeout as uncertain", async () => {
    const q = await courier.quote(quoteInput);
    mock.failNextOrders("timeout");
    await expect(courier.book(book(q))).rejects.toThrow(CourierUncertainError);
    expect(orderPosts()).toHaveLength(1);
  });

  it("treats a 2xx without an order id as uncertain", async () => {
    const q = await courier.quote(quoteInput);
    let n = 0;
    const odd = createLalamoveCourier(() => ({ config: MOCK_CONFIG, fetch: (async () => { n++; return new Response("{}", { status: 201 }); }) as typeof fetch, sleep }));
    await expect(odd.book(book(q))).rejects.toThrow(CourierUncertainError);
    expect(n).toBe(1);
  });

  it("a plain network error is uncertain after exactly one attempt", async () => {
    const q = await courier.quote(quoteInput);
    let n = 0;
    const down = createLalamoveCourier(() => ({ config: MOCK_CONFIG, fetch: (async () => { n++; throw new TypeError("fetch failed"); }) as typeof fetch, sleep }));
    await expect(down.book(book(q))).rejects.toThrow(CourierUncertainError);
    expect(n).toBe(1);
  });

  it("never books a missing or zero total at zero, and flags a price above the quote", async () => {
    const q = await courier.quote(quoteInput);
    const answer = (priceBreakdown: unknown) =>
      createLalamoveCourier(() => ({ config: MOCK_CONFIG, fetch: (async () => new Response(JSON.stringify({ data: { orderId: "1234567890123456789", priceBreakdown } }), { status: 201 })) as typeof fetch, sleep }));
    expect((await answer({}).book(book(q))).priceCentavos).toBe(q.amountCentavos);
    expect((await answer({ total: "0" }).book(book(q))).priceCentavos).toBe(q.amountCentavos);
    expect((await answer({ total: "abc" }).book(book(q))).priceCentavos).toBe(q.amountCentavos);
    const above = String(q.amountCentavos / 100 + 10);
    expect((await answer({ total: above }).book(book(q))).priceCentavos).toBe(q.amountCentavos + 1000);
    expect(console.error).toHaveBeenCalledWith("lalamove booked above quote", "1234567890123456789", q.amountCentavos, q.amountCentavos + 1000);
  });

  it("402 is a definite CourierError", async () => {
    const q = await courier.quote(quoteInput);
    mock.failNextOrders(402);
    const err = await courier.book(book(q)).catch((e) => e);
    expect(err).toBeInstanceOf(CourierError);
    expect(err).not.toBeInstanceOf(CourierUncertainError);
    expect(err.message).toMatch(/balance/);
  });

  it("an unknown or already used quotation is a definite CourierError", async () => {
    const q = await courier.quote(quoteInput);
    await courier.book(book(q));
    await expect(courier.book(book(q))).rejects.toThrow(/price expired/);
    await expect(courier.book(book({ ...q, ref: "nope" }))).rejects.toThrow(/price expired/);
  });

  it("an expired quotation is a definite CourierError", async () => {
    const q = await courier.quote(quoteInput);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 6 * 60_000);
    try {
      await expect(courier.book(book(q))).rejects.toThrow(/price expired/);
    } finally {
      vi.useRealTimers();
    }
  });

  it("a price change shows up between quotes", async () => {
    const a = await courier.quote(quoteInput);
    mock.setPriceMultiplier(2);
    const b = await courier.quote(quoteInput);
    expect(b.amountCentavos).toBeGreaterThan(a.amountCentavos);
  });
});

describe("Lalamove vehicles", () => {
  it("lists mock vehicles and caches for a day", async () => {
    const list = await courier.vehicles();
    expect(list.map((v) => [v.key, v.loadKg])).toEqual([["MOTORCYCLE", 20], ["MPV", 200], ["VAN", 600]]);
    await courier.vehicles();
    expect(mock.calls.filter((c) => c.path === "/v3/cities")).toHaveLength(1);
  });

  it("dedupes keys across cities and nulls non-kg loads", async () => {
    const city = (services: unknown[]) => ({ locode: "X", name: "X", services });
    const body = { data: [city([{ key: "CAR", description: "Car", load: { value: "100", unit: "kg" } }]), city([{ key: "CAR", description: "dup" }, { key: "TRUCK", description: "T", load: { value: "2", unit: "t" } }])] };
    const c = createLalamoveCourier(() => ({ config: MOCK_CONFIG, fetch: (async () => new Response(JSON.stringify(body))) as typeof fetch, sleep }));
    expect(await c.vehicles()).toEqual([{ key: "CAR", description: "Car", loadKg: 100 }, { key: "TRUCK", description: "T", loadKg: null }]);
  });

  it("refetches after 24 hours", async () => {
    let t = 0;
    const c = createLalamoveCourier(() => ({ config: MOCK_CONFIG, fetch: mock.fetch as typeof fetch, now: () => t, sleep }));
    await c.vehicles();
    t = 25 * 60 * 60 * 1000;
    await c.vehicles();
    expect(mock.calls.filter((x) => x.path === "/v3/cities")).toHaveLength(2);
  });
});

describe("Lalamove webhooks", () => {
  const verify = (w: { body: string; headers: Headers }) => courier.verifyWebhook(w.body);
  const status = (s: string, extra: Record<string, unknown> = {}) => ({ order: { orderId: "111", status: s, ...extra }, updatedAt: "2026-11-27T01:02:03.000Z" });

  it("accepts a good signature and rejects bad ones", () => {
    expect(verify(mock.webhook("ORDER_STATUS_CHANGED", status("PICKED_UP")))).not.toBeNull();
    const w = mock.webhook("ORDER_STATUS_CHANGED", status("PICKED_UP"));
    const env = JSON.parse(w.body);
    expect(courier.verifyWebhook(JSON.stringify({ ...env, signature: "00".repeat(32) }))).toBeNull();
    expect(courier.verifyWebhook(JSON.stringify({ ...env, data: status("COMPLETED") }))).toBeNull();
    expect(verify(mock.webhook("ORDER_STATUS_CHANGED", status("PICKED_UP"), { apiKey: "pk_other" }))).toBeNull();
    expect(courier.verifyWebhook("")).toBeNull();
    expect(courier.verifyWebhook("not json")).toBeNull();
  });

  it("maps statuses to tracking events", () => {
    const picked = verify(mock.webhook("ORDER_STATUS_CHANGED", status("PICKED_UP")));
    expect(picked).toMatchObject({ trackingRef: "111", status: "picked_up", occurredAt: "2026-11-27T01:02:03.000Z", codCollectedCentavos: null });
    expect((picked as { id: string }).id).toMatch(/^[0-9A-F-]{36}$/);
    expect(verify(mock.webhook("ORDER_STATUS_CHANGED", status("COMPLETED")))).toMatchObject({ status: "delivered" });
    expect(verify(mock.webhook("ORDER_STATUS_CHANGED", status("ON_GOING")))).toBe("ignored");
    expect(verify(mock.webhook("ORDER_STATUS_CHANGED", status("ASSIGNING_DRIVER")))).toBe("ignored");
  });

  it("falls back to the envelope timestamp for occurredAt", () => {
    const r = verify(mock.webhook("ORDER_STATUS_CHANGED", { order: { orderId: "111", status: "PICKED_UP" } })) as { occurredAt: string };
    expect(Math.abs(Date.parse(r.occurredAt) - Date.now())).toBeLessThan(5000);
  });

  it("maps EXPIRED and REJECTED to void, CANCELED to flag, ORDER_REPLACED to replace", () => {
    expect(verify(mock.webhook("ORDER_STATUS_CHANGED", status("EXPIRED")))).toMatchObject({ kind: "void", trackingRef: "111" });
    expect(verify(mock.webhook("ORDER_STATUS_CHANGED", status("REJECTED")))).toMatchObject({ kind: "void", trackingRef: "111" });
    const flag = verify(mock.webhook("ORDER_STATUS_CHANGED", status("CANCELED", { cancelParty: "USER", cancelReason: "other" })));
    expect(flag).toMatchObject({ kind: "flag", trackingRef: "111" });
    expect((flag as { note: string }).note).toMatch(/USER.*other/);
    expect(verify(mock.webhook("ORDER_REPLACED", { order: { orderId: "222" }, prevOrderId: "111", updatedAt: "2026-11-27T01:02:03.000Z" }))).toMatchObject({
      kind: "replace", trackingRef: "111", newTrackingRef: "222",
    });
  });

  it("ignores other events", () => {
    expect(verify(mock.webhook("WALLET_BALANCE_CHANGED", { balance: { amount: "1", currency: "PHP" }, updatedAt: "2026-11-27T01:02:03.000Z" }))).toBe("ignored");
    expect(verify(mock.webhook("DRIVER_ASSIGNED", { order: { orderId: "111" } }))).toBe("ignored");
  });
});
