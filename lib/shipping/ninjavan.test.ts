import { beforeEach, describe, expect, it, vi } from "vitest";
import { createNinjaVanCourier, type TokenVault } from "./ninjavan";
import { createNinjaVanMock, MOCK_CONFIG, type NinjaVanMock } from "./ninjavan-mock";
import { mapStatus, ORDER_PATH, orderRequestBody, requestedTrackingNumber, TOKEN_PATH, tokenRequestBody } from "./ninjavan-wire";
import { CourierError, type BookInput, type PickupFrom } from "./types";

const pickupFrom: PickupFrom = {
  name: "Ship Co", phone: "09171234567", line1: "1 Shaw Blvd", line2: "", barangay: "Wack-Wack",
  city: "Mandaluyong", province: "Metro Manila", postalCode: "1550", parcelWeightGrams: 800,
};
const shipTo = {
  recipient: "Juan Buyer", phone: "09181234567", line1: "2 Osmeña Blvd", line2: "Unit 3", barangay: "Kalubihan",
  city: "Cebu City", province: "Cebu", postalCode: "6000",
};

function memoryVault(): TokenVault {
  let saved: Awaited<ReturnType<TokenVault["load"]>> = null;
  return { load: async () => saved, save: async (t) => void (saved = t) };
}

let mock: NinjaVanMock;
let vault: ReturnType<typeof memoryVault>;
let courier: ReturnType<typeof createNinjaVanCourier>;

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  mock = createNinjaVanMock();
  vault = memoryVault();
  courier = createNinjaVanCourier(() => ({ config: MOCK_CONFIG, fetch: mock.fetch as typeof fetch, vault }));
});

const order = (ref: string, cod = 0): BookInput => ({ orderRef: ref, shipTo, codAmountCentavos: cod, pickupFrom });
const count = (path: string) => mock.calls.filter((c) => c.path === path).length;

describe("Ninja Van pre-audit self-check (3 scenarios against the mock)", () => {
  // TODO(ninjavan): replace with Ninja Van PH's exact 3 audit scenarios once received.
  it("books 3 orders with one token, no retries of 4xx, three tracking numbers", async () => {
    const refs = ["ORD-2026-00001", "ORD-2026-00002", "ORD-2026-00003"];
    const results = [
      await courier.book(order(refs[0])), // prepaid
      await courier.book(order(refs[1], 125050)), // COD ₱1,250.50
      await courier.book({ ...order(refs[2]), pickupFrom: { ...pickupFrom, parcelWeightGrams: 4500 } }), // heavier parcel
    ];
    expect(new Set(results.map((r) => r.trackingRef)).size).toBe(3);
    expect(count(TOKEN_PATH)).toBe(1);
    expect(mock.calls.filter((c) => c.status >= 400)).toHaveLength(0);

    const cod = mock.calls.filter((c) => c.path === ORDER_PATH)[1].body as { parcel_job: Record<string, unknown> };
    expect(cod.parcel_job.cash_on_delivery).toBe(1250.5);
    expect(cod.parcel_job.cash_on_delivery_currency).toBe("PHP");
    const prepaid = mock.calls.filter((c) => c.path === ORDER_PATH)[0].body as { parcel_job: Record<string, unknown> };
    expect(prepaid.parcel_job).not.toHaveProperty("cash_on_delivery");
  });
});

describe("Ninja Van booking", () => {
  it("refuses to book until TULAY's credentials are set", async () => {
    const off = createNinjaVanCourier(() => ({ config: { ...MOCK_CONFIG, clientSecret: "" }, fetch: mock.fetch as typeof fetch, vault }));
    await expect(off.book(order("ORD-2026-00009"))).rejects.toThrow(CourierError);
    expect(mock.calls).toHaveLength(0);
  });

  it("gets TULAY's token by client credentials and reuses it", async () => {
    await courier.book(order("ORD-2026-00015"));
    await courier.book(order("ORD-2026-00016"));
    expect(count(TOKEN_PATH)).toBe(1);
    expect(mock.calls.find((c) => c.path === TOKEN_PATH)?.body).toEqual(tokenRequestBody(MOCK_CONFIG));
    expect(tokenRequestBody(MOCK_CONFIG).grant_type).toBe("client_credentials");
  });

  it("asks for a pickup address before calling Ninja Van", async () => {
    await expect(courier.book({ ...order("ORD-2026-00009"), pickupFrom: null })).rejects.toThrow(/pickup address/);
  });

  it("refreshes an expired token once and books", async () => {
    await courier.book(order("ORD-2026-00017")); // caches TULAY's token
    mock.expireAllTokens(); // the saved expiry still looks valid: Ninja Van answers 401
    await courier.book(order("ORD-2026-00010"));
    expect(count(TOKEN_PATH)).toBe(2);
    expect(mock.calls.filter((c) => c.path === ORDER_PATH).map((c) => c.status)).toEqual([200, 401, 200]);
  });

  it("retries a 503 with the same requested tracking number", async () => {
    mock.failNextOrders(503);
    await courier.book(order("ORD-2026-00011"));
    const sent = mock.calls.filter((c) => c.path === ORDER_PATH).map((c) => c.body.requested_tracking_number);
    expect(sent).toEqual(["ORD202600011", "ORD202600011"]);
  });

  it("never resends after a 400", async () => {
    mock.failNextOrders(400);
    await expect(courier.book(order("ORD-2026-00012"))).rejects.toThrow(/rejected/);
    expect(count(ORDER_PATH)).toBe(1);
  });

  it("does not book the same order twice", async () => {
    await courier.book(order("ORD-2026-00013"));
    await expect(courier.book(order("ORD-2026-00013"))).rejects.toThrow(/already has a booking/);
  });

  it("uses the shipper API paths (not the plugin API)", () => {
    expect(TOKEN_PATH).toBe("/2.0/oauth/access_token");
    expect(ORDER_PATH).toBe("/4.2/orders");
  });

  it("sends Philippine address fields (province, district), not state", () => {
    const body = orderRequestBody({ orderRef: "ORD-1", shipTo, codAmountCentavos: 0, sender: pickupFrom, now: 0 });
    expect(body.to.address).toMatchObject({ district: "Kalubihan", city: "Cebu City", province: "Cebu", postcode: "6000" });
    expect(body.to.address).not.toHaveProperty("state");
  });

  it("derives a stable requested tracking number from the order ref", () => {
    expect(requestedTrackingNumber("ORD-2026-00012")).toBe("ORD202600012");
  });
});

describe("Ninja Van webhooks", () => {
  it("accepts a signed delivery event", () => {
    const { body, headers } = mock.webhook({ tracking_id: "NVPHTULORD1", status: "Delivered", timestamp: "2026-11-16T09:00:00Z" });
    const ev = courier.verifyWebhook(body, headers);
    expect(ev).toMatchObject({ trackingRef: "NVPHTULORD1", status: "delivered", occurredAt: "2026-11-16T09:00:00.000Z" });
  });

  it("gives a redelivered body the same event id", () => {
    const { body, headers } = mock.webhook({ tracking_id: "T1", status: "Picked Up" });
    const a = courier.verifyWebhook(body, headers);
    const b = courier.verifyWebhook(body, headers);
    expect(a !== null && a !== "ignored" && b !== null && b !== "ignored" && a.id === b.id).toBe(true);
  });

  it("rejects a tampered or unsigned body", () => {
    const { body, headers } = mock.webhook({ tracking_id: "T1", status: "Delivered" });
    expect(courier.verifyWebhook(body.replace("T1", "T2"), headers)).toBeNull();
    expect(courier.verifyWebhook(body, new Headers())).toBeNull();
  });

  it("acknowledges statuses we do not track", () => {
    const { body, headers } = mock.webhook({ tracking_id: "T1", status: "Pending Pickup" });
    expect(courier.verifyWebhook(body, headers)).toBe("ignored");
  });

  it("parses a V2 delivered payload, using the event text as the note", () => {
    const { body, headers } = mock.webhook({
      tracking_id: "X", timestamp: "2024-11-21T11:45:40+0800", event: "Delivered, Received by Customer", status: "Delivered", is_parcel_on_rts_leg: false,
    });
    expect(courier.verifyWebhook(body, headers)).toMatchObject({
      status: "delivered", occurredAt: "2024-11-21T03:45:40.000Z", note: "Delivered, Received by Customer",
    });
  });

  it("maps hub arrivals to in transit", () => {
    const { body, headers } = mock.webhook({ tracking_id: "X", status: "Arrived at Destination Hub" });
    expect(courier.verifyWebhook(body, headers)).toMatchObject({ status: "in_transit" });
  });

  it("on the return leg tracks only Returned to Sender", () => {
    const a = mock.webhook({ tracking_id: "X", status: "On Vehicle for Delivery", is_parcel_on_rts_leg: true });
    expect(courier.verifyWebhook(a.body, a.headers)).toBe("ignored");
    const b = mock.webhook({ tracking_id: "X", status: "Returned to Sender", is_parcel_on_rts_leg: true });
    expect(courier.verifyWebhook(b.body, b.headers)).toMatchObject({ status: "returned" });
  });

  it("maps Ninja Van status text", () => {
    expect(mapStatus("On Vehicle for Delivery")).toBe("out_for_delivery");
    expect(mapStatus("Returned to Sender")).toBe("returned");
    expect(mapStatus("Cancelled")).toBeNull();
  });
});
