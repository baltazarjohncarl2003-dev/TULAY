import { describe, expect, it } from "vitest";
import { php, quoteKnownTotal, toCentavos } from "./format";
import type { Quote } from "./types";

describe("php", () => {
  it("formats centavos", () => {
    expect(php(123456789)).toBe("₱1,234,567.89");
    expect(php(5)).toBe("₱0.05");
    expect(php(-1500)).toBe("-₱15.00");
    expect(php(null)).toBe("Not provided");
  });
  it("rejects floats", () => expect(() => php(1.5)).toThrow());
});

describe("toCentavos", () => {
  it("parses without float error", () => {
    expect(toCentavos("0.29")).toBe(29);
    expect(toCentavos("1,250.5")).toBe(125050);
    expect(toCentavos("")).toBeNull();
  });
  it("rejects bad input", () => {
    expect(() => toCentavos("1.234")).toThrow();
    expect(() => toCentavos("-5")).toThrow();
  });
});

describe("centavosToInput", () => {
  it("formats without float math", () => {
    expect(centavosToInput(29)).toBe("0.29");
    expect(centavosToInput(125050)).toBe("1250.50");
    expect(centavosToInput(null)).toBe("");
    expect(centavosToInput(undefined)).toBe("");
  });
  it("round-trips with toCentavos", () => expect(toCentavos(centavosToInput(123456789))).toBe(123456789));
  it("rejects floats and negatives", () => {
    expect(() => centavosToInput(1.5)).toThrow();
    expect(() => centavosToInput(-1)).toThrow();
  });
});

describe("date and dateTime (Asia/Manila)", () => {
  it("rolls to the next day after 16:00 UTC", () => {
    expect(date("2026-11-13T17:00:00Z")).toBe("2026-11-14");
    expect(dateTime("2026-11-13T17:05:00Z")).toBe("2026-11-14 01:05");
  });
  it("keeps date-only values on the same day", () => expect(date("2026-11-20")).toBe("2026-11-20"));
  it("shows a dash when missing", () => expect(date(null)).toBe("—"));
});

describe("quoteKnownTotal", () => {
  const base = { quantity: 1000, unitPriceCentavos: 1850, priceTiers: [], setupFeeCentavos: 50000, shippingFeeCentavos: null, taxCentavos: 0 } as unknown as Quote;
  it("sums provided fees and flags missing ones", () => {
    expect(quoteKnownTotal(base)).toEqual({ totalCentavos: 1900000, partial: true });
    expect(quoteKnownTotal({ ...base, shippingFeeCentavos: 30000 }).partial).toBe(false);
  });
  it("applies the price tier for the quoted quantity, like compareQuotes", () => {
    const tiered = { ...base, priceTiers: [{ minQty: 500, unitPriceCentavos: 1500 }] } as Quote;
    expect(quoteKnownTotal(tiered).totalCentavos).toBe(1000 * 1500 + 50000 + 0);
  });
});
