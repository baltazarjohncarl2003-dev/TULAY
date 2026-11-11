import { describe, expect, it } from "vitest";
import type { Quote } from "@/lib/types";
import { compareQuotes, unitPriceAt } from "./quotes";

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

describe("compareQuotes", () => {
  it("totals in integer centavos and lists blank fees", () => {
    const [row] = compareQuotes([base], 200);
    expect(row.subtotalCentavos).toBe(180000);
    expect(row.totalCentavos).toBe(180500);
    expect(row.missing).toEqual(["shipping"]);
    expect(row.lowestTotal).toBe(false); // no highlight with a single quote
  });
  it("flags lowest total and fastest, ties included", () => {
    const b = { ...base, id: "b", priceTiers: [], unitPriceCentavos: 850, setupFeeCentavos: null, leadDays: 5 };
    const c = { ...base, id: "c", leadDays: 5 };
    const rows = compareQuotes([base, b, c], 500);
    expect(rows.map((r) => r.totalCentavos)).toEqual([400500, 425000, 400500]);
    expect(rows.map((r) => r.lowestTotal)).toEqual([true, false, true]);
    expect(rows.map((r) => r.fastest)).toEqual([false, true, true]);
  });
  it("refuses totals beyond safe integers", () => {
    expect(() => compareQuotes([{ ...base, priceTiers: [], unitPriceCentavos: Number.MAX_SAFE_INTEGER }], 2)).toThrow(RangeError);
  });
});
