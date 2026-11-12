import { beforeAll, describe, expect, it } from "vitest";
import { fakeProvider, signFakeEvent } from "./fake";
import type { PaymentEvent } from "./types";

const event: PaymentEvent = {
  id: "evt_1",
  type: "payment.paid",
  providerRef: "fake_3f2b1c4d-0000-4000-8000-000000000001",
  amountCentavos: 560000,
  feeCentavos: null,
};

beforeAll(() => {
  process.env.FAKE_PAYMENT_WEBHOOK_SECRET = "test-secret-test-secret-test-secret-123";
});

describe("fake gateway webhook signature", () => {
  it("accepts a correctly signed event", () => {
    const { body, headers } = signFakeEvent(event);
    expect(fakeProvider.verifyWebhook(body, new Headers(headers))).toEqual(event);
  });
  it("rejects a tampered body, a wrong or missing signature", () => {
    const { body, headers } = signFakeEvent(event);
    expect(fakeProvider.verifyWebhook(body.replace("560000", "1"), new Headers(headers))).toBeNull();
    expect(fakeProvider.verifyWebhook(body, new Headers({ "x-fake-signature": "00" }))).toBeNull();
    expect(fakeProvider.verifyWebhook(body, new Headers())).toBeNull();
  });
  it("rejects a signed but malformed event", () => {
    const bad = signFakeEvent({ ...event, amountCentavos: 1.5 });
    expect(fakeProvider.verifyWebhook(bad.body, new Headers(bad.headers))).toBeNull();
  });
});
