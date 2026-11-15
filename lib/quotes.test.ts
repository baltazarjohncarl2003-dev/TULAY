import { describe, expect, it } from "vitest";
import type { Quote } from "@/lib/types";
import { compareQuotes, latestQuotesOf, quoteTotal, unitPriceAt } from "./quotes";

const base: Quote = {
  id: "q", ref: "QT", rfqId: "r", supplierId: "s", revision: 1, quantity: 100,
  unitPriceCentavos: 1000, setupFeeCentavos: 500, shippingFeeCentavos: null, taxCentavos: 0,
  leadDays: 7, validUntil: "2026-12-01", paymentTerms: "", notes: "", createdAt: "2026-11-01",
  priceTiers: [{ minQty: 500, unitPriceCentavos: 800 }, { minQty: 200, unitPriceCentavos: 900 }],
  deliveryTerms: "supplier_delivery", birInvoice: "vat",
};

describe("unitPriceAt", () => {
  it("uses the highest tier reached, in any order", () => {
    expect(unitPriceAt(base, 199)).toBe(1000);
    expect(unitPriceAt(base, 200)).toBe(900);
    expect(unitPriceAt(base, 499)).toBe(900);
    expect(unitPriceAt(base, 5000)).toBe(800);
  });
  it("falls back to the base price with no tiers", () => {
    expect(unitPriceAt({ ...base, priceTiers: [] }, 1000)).toBe(1000);
  });
});

describe("quoteTotal", () => {
  it("charges the quote's own quantity at its tier price, in integer centavos", () => {
    const t = quoteTotal({ ...base, quantity: 200 });
    expect(t).toMatchObject({ quantity: 200, unitPriceCentavos: 900, subtotalCentavos: 180000, totalCentavos: 180500 });
    expect(t.missing).toEqual(["shipping"]);
  });
  it("uses an accepted counteroffer's quantity and price instead", () => {
    expect(quoteTotal(base, { quantity: 300, unitPriceCentavos: 700 }).totalCentavos).toBe(210500);
  });
});

describe("compareQuotes", () => {
  it("compares at each quote's own quantity and flags a mismatch with the request", () => {
    const small = { ...base, id: "s", quantity: 100, priceTiers: [], unitPriceCentavos: 1000 };
    const big = { ...base, id: "b", quantity: 500, priceTiers: [], unitPriceCentavos: 900 };
    const rows = compareQuotes([small, big], 500);
    expect(rows.map((r) => r.totalCentavos)).toEqual([100500, 450500]);
    expect(rows.map((r) => r.quantityDiffers)).toEqual([true, false]);
    expect(rows.map((r) => r.lowestTotal)).toEqual([true, false]);
  });
  it("no highlight with a single quote", () => {
    expect(compareQuotes([base], 100)[0].lowestTotal).toBe(false);
  });
  it("flags fastest, ties included", () => {
    const rows = compareQuotes([base, { ...base, id: "b", leadDays: 5 }, { ...base, id: "c", leadDays: 5 }], 100);
    expect(rows.map((r) => r.fastest)).toEqual([false, true, true]);
  });
  it("refuses totals beyond safe integers", () => {
    expect(() => compareQuotes([{ ...base, quantity: 2, priceTiers: [], unitPriceCentavos: Number.MAX_SAFE_INTEGER }], 2)).toThrow(RangeError);
  });
});

describe("latestQuotesOf", () => {
  it("keeps the highest revision per supplier for one RFQ", () => {
    const q = (rfqId: string, supplierId: string, revision: number) => ({ rfqId, supplierId, revision }) as Quote;
    const got = latestQuotesOf([q("r1", "a", 1), q("r1", "a", 2), q("r1", "b", 1), q("r2", "a", 5)], "r1");
    expect(got.map((x) => `${x.supplierId}${x.revision}`).sort()).toEqual(["a2", "b1"]);
  });
});
