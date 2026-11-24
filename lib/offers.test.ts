import { describe, expect, it } from "vitest";
import { bpsToPercentInput, offerStatus, openOffer, percentLabel, type ChatOffer } from "./offers";

const NOW = Date.parse("2026-11-25T00:00:00Z");
const LATER = "2026-11-26T00:00:00Z";
const EARLIER = "2026-11-24T00:00:00Z";

let seq = 0;
const row = (over: Partial<ChatOffer>): ChatOffer => ({
  id: `o${++seq}`, seq, actorId: "buyer", action: "offer", revision: 1, relatedOfferId: null, productName: "Shirt",
  productType: "", specs: "", unit: "pcs", quantity: 50, unitPriceCentavos: 12000, shippingFeeCentavos: 0,
  subtotalCentavos: 600000, totalCentavos: 600000, downpaymentBps: 5000, downpaymentCentavos: 300000, leadDays: 7,
  paymentTerms: "", conditions: "", validUntil: LATER, createdAt: EARLIER, ...over,
});

describe("offer status", () => {
  // Buyer 120, supplier counters 135, buyer counters 125, supplier accepts 125.
  const r1 = row({ id: "r1", revision: 1 });
  const r2 = row({ id: "r2", revision: 2, action: "counter", relatedOfferId: "r1", actorId: "supplier" });
  const r3 = row({ id: "r3", revision: 3, action: "counter", relatedOfferId: "r2" });
  const ok = row({ id: "a3", revision: 3, action: "accept", relatedOfferId: "r3", actorId: "supplier" });
  const all = [r1, r2, r3, ok];

  it("marks replaced revisions as countered and the answered one as accepted", () => {
    expect([r1, r2, r3].map((p) => offerStatus(all, p, NOW))).toEqual(["countered", "countered", "accepted"]);
  });
  it("has no open offer once accepted", () => expect(openOffer(all, NOW)).toBeNull());
  it("finds the open offer mid-negotiation", () => expect(openOffer([r1, r2], NOW)?.id).toBe("r2"));
  it("expires an unanswered offer past its time", () => {
    const old = row({ validUntil: EARLIER });
    expect(offerStatus([old], old, NOW)).toBe("expired");
    expect(openOffer([old], NOW)).toBeNull();
  });
  it("shows withdrawn and rejected", () => {
    const p = row({ id: "p" });
    expect(offerStatus([p, row({ action: "withdraw", relatedOfferId: "p" })], p, NOW)).toBe("withdrawn");
    expect(offerStatus([p, row({ action: "reject", relatedOfferId: "p" })], p, NOW)).toBe("rejected");
  });
});

describe("percent labels", () => {
  it("formats basis points", () => {
    expect([5000, 3350, 10000, 0, 125].map(percentLabel)).toEqual(["50%", "33.5%", "100%", "0%", "1.25%"]);
    expect(bpsToPercentInput(3350)).toBe("33.5");
  });
});
