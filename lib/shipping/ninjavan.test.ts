import { beforeEach, describe, expect, it, vi } from "vitest";
import { createNinjaVanCourier, type TokenVault } from "./ninjavan";
import { createNinjaVanMock, MOCK_CODE, MOCK_CONFIG, type NinjaVanMock } from "./ninjavan-mock";
import { mapStatus, ORDER_PATH, requestedTrackingNumber, TOKEN_PATH } from "./ninjavan-wire";
import { CourierError, type BookInput, type PickupFrom } from "./types";

const SUPPLIER = "aa000000-0000-4000-8000-000000000001";

const pickupFrom: PickupFrom = {
  name: "Ship Co", phone: "09171234567", line1: "1 Shaw Blvd", line2: "", barangay: "Wack-Wack",
  city: "Mandaluyong", province: "Metro Manila", postalCode: "1550", parcelWeightGrams: 800,
};
const shipTo = {
  recipient: "Juan Buyer", phone: "09181234567", line1: "2 Osmeña Blvd", line2: "Unit 3", barangay: "Kalubihan",
  city: "Cebu City", province: "Cebu", postalCode: "6000",
};

function memoryVault(): TokenVault & { grants: Map<string, unknown> } {
  const grants = new Map<string, never>();
  return {
    grants,
    load: async (id) => grants.get(id) ?? null,
    save: async (id, g) => void grants.set(id, g as never),
  };
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

const order = (ref: string, cod = 0): BookInput => ({ supplierId: SUPPLIER, orderRef: ref, shipTo, codAmountCentavos: cod, pickupFrom });
const count = (path: string) => mock.calls.filter((c) => c.path === path).length;

describe("Ninja Van pre-audit self-check (3 scenarios against the mock)", () => {
  // TODO(ninjavan): replace with Ninja Van PH's exact 3 audit scenarios once received.
  it("books 3 orders with one token, no retries of 4xx, three tracking numbers", async () => {
    await courier.connect(SUPPLIER, MOCK_CODE);
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
    const prepaid = mock.calls.filter((c) => c.path === ORDER_PATH)[0].body as { parcel_job: Record<string, unknown> };
    expect(prepaid.parcel_job).not.toHaveProperty("cash_on_delivery");
  });
});

describe("Ninja Van booking", () => {
  it("asks the supplier to connect first", async () => {
    await expect(courier.book(order("ORD-2026-00009"))).rejects.toThrow(CourierError);
    expect(count(ORDER_PATH)).toBe(0);
  });

  it("asks for a pickup address before calling Ninja Van", async () => {
    await courier.connect(SUPPLIER, MOCK_CODE);
    await expect(courier.book({ ...order("ORD-2026-00009"), pickupFrom: null })).rejects.toThrow(/pickup address/);
  });

  it("refreshes an expired token once and books", async () => {
    await courier.connect(SUPPLIER, MOCK_CODE);
    mock.expireAllTokens(); // the saved expiry still looks valid: Ninja Van answers 401
    await courier.book(order("ORD-2026-00010"));
    expect(count(TOKEN_PATH)).toBe(2);
    expect(mock.calls.filter((c) => c.path === ORDER_PATH).map((c) => c.status)).toEqual([401, 200]);
  });

  it("retries a 503 with the same requested tracking number", async () => {
    await courier.connect(SUPPLIER, MOCK_CODE);
    mock.failNextOrders(503);
    await courier.book(order("ORD-2026-00011"));
    const sent = mock.calls.filter((c) => c.path === ORDER_PATH).map((c) => c.body.requested_tracking_number);
    expect(sent).toEqual(["ORD202600011", "ORD202600011"]);
  });

  it("never resends after a 400", async () => {
    await courier.connect(SUPPLIER, MOCK_CODE);
    mock.failNextOrders(400);
    await expect(courier.book(order("ORD-2026-00012"))).rejects.toThrow(/rejected/);
    expect(count(ORDER_PATH)).toBe(1);
  });

  it("does not book the same order twice", async () => {
    await courier.connect(SUPPLIER, MOCK_CODE);
    await courier.book(order("ORD-2026-00013"));
    await expect(courier.book(order("ORD-2026-00013"))).rejects.toThrow(/already has a booking/);
  });

  it("derives a stable requested tracking number from the order ref", () => {
    expect(requestedTrackingNumber("ORD-2026-00012")).toBe("ORD202600012");
  });
});

describe("Ninja Van webhooks", () => {
  it("accepts a signed delivery event", () => {
    const { body, headers } = mock.webhook({ tracking_id: "NVPHTULORD1", status: "Successful Delivery", timestamp: "2026-11-16T09:00:00Z" });
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
    const { body, headers } = mock.webhook({ tracking_id: "T1", status: "Successful Delivery" });
    expect(courier.verifyWebhook(body.replace("T1", "T2"), headers)).toBeNull();
    expect(courier.verifyWebhook(body, new Headers())).toBeNull();
  });

  it("acknowledges statuses we do not track", () => {
    const { body, headers } = mock.webhook({ tracking_id: "T1", status: "Pending Pickup" });
    expect(courier.verifyWebhook(body, headers)).toBe("ignored");
  });

  it("maps Ninja Van status text", () => {
    expect(mapStatus("On Vehicle for Delivery")).toBe("out_for_delivery");
    expect(mapStatus("Returned to Sender")).toBe("returned");
    expect(mapStatus("Cancelled")).toBeNull();
  });
});
