import { describe, expect, it } from "vitest";
import { unitPriceFor } from "./pricing";

const tiers = [
  { minQty: 50, unitPriceCentavos: 9000 },
  { minQty: 100, unitPriceCentavos: 8500 },
];

describe("unitPriceFor (matches start_checkout)", () => {
  it("uses the indicative price below the first tier", () => {
    expect(unitPriceFor(10000, tiers, 49)).toBe(10000);
  });
  it("uses the highest tier reached", () => {
    expect(unitPriceFor(10000, tiers, 50)).toBe(9000);
    expect(unitPriceFor(10000, tiers, 250)).toBe(8500);
  });
  it("adds the option price change", () => {
    expect(unitPriceFor(10000, tiers, 10, 500)).toBe(10500);
    expect(unitPriceFor(10000, tiers, 50, -1000)).toBe(8000);
  });
  it("is null for price on request or a non-positive result", () => {
    expect(unitPriceFor(null, [], 10)).toBeNull();
    expect(unitPriceFor(1000, [], 1, -1000)).toBeNull();
  });
});
