import { describe, expect, it } from "vitest";
import { php, quoteKnownTotal, toCentavos } from "./format";
import type { Quote } from "./demo/types";

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

describe("quoteKnownTotal", () => {
  const base = { quantity: 1000, unitPriceCentavos: 1850, setupFeeCentavos: 50000, shippingFeeCentavos: null, taxCentavos: 0 } as Quote;
  it("sums provided fees and flags missing ones", () => {
    expect(quoteKnownTotal(base)).toEqual({ totalCentavos: 1900000, partial: true });
    expect(quoteKnownTotal({ ...base, shippingFeeCentavos: 30000 }).partial).toBe(false);
  });
});
