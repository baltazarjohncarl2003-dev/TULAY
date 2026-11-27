import { beforeAll, describe, expect, it } from "vitest";
import { fakeCourier, signFakeTracking } from "./fake";
import type { TrackingEvent } from "./types";

const event: TrackingEvent = {
  id: "trk_1",
  trackingRef: "FAKE-0123456789AB",
  status: "delivered",
  occurredAt: "2026-11-12T09:00:00.000Z",
  note: "",
  codCollectedCentavos: 17500,
};

beforeAll(() => {
  process.env.FAKE_COURIER_WEBHOOK_SECRET = "courier-secret-courier-secret-courier-1";
});

describe("fake courier webhook signature", () => {
  it("accepts a correctly signed event", () => {
    const { body, headers } = signFakeTracking(event);
    expect(fakeCourier.verifyWebhook(body, new Headers(headers))).toEqual(event);
  });
  it("rejects tampering and missing signatures", () => {
    const { body, headers } = signFakeTracking(event);
    expect(fakeCourier.verifyWebhook(body.replace("17500", "1"), new Headers(headers))).toBeNull();
    expect(fakeCourier.verifyWebhook(body, new Headers())).toBeNull();
  });
  it("books with a well-formed tracking reference", async () => {
    expect((await fakeCourier.book({ orderRef: "ORD-1", shipTo: {} as never, codAmountCentavos: 0, pickupFrom: null })).trackingRef).toMatch(/^FAKE-[0-9A-F]{12}$/);
  });
  it("quotes a flat test price, lists test vehicles and books at the quoted price", async () => {
    const stop = { lat: 14.5, lng: 121, address: "a" };
    const q = await fakeCourier.quote!({ pickup: stop, dropoff: stop, serviceType: null });
    expect(q).toMatchObject({ amountCentavos: 15000, stopRefs: ["1", "2"] });
    expect(q.ref).toMatch(/^FAKEQ-[0-9a-f]{12}$/);
    expect((await fakeCourier.vehicles!()).map((v) => v.key)).toEqual(["MOTORCYCLE", "MPV", "VAN"]);
    const b = await fakeCourier.book({ orderRef: "ORD-1", shipTo: {} as never, codAmountCentavos: 0, pickupFrom: null, quote: q });
    expect(b).toMatchObject({ priceCentavos: 15000, shareLink: null });
  });
});
