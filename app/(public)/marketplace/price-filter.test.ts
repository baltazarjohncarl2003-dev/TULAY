import { describe, expect, it } from "vitest";
import { pesosToCentavos } from "./marketplace-client";

describe("pesosToCentavos", () => {
  it("converts whole pesos to integer centavos", () => {
    expect(pesosToCentavos("1250")).toBe(125000);
    expect(pesosToCentavos(" 0 ")).toBe(0);
  });
  it("ignores empty, decimal, negative and oversized input", () => {
    for (const bad of ["", "12.5", "-5", "1e3", "abc", "1234567890"]) expect(pesosToCentavos(bad)).toBeNull();
  });
});
