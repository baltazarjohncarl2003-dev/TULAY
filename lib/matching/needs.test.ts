import { describe, expect, it } from "vitest";
import { parseBudgetCentavos, splitNeeds } from "./needs";

const COFFEE =
  "I am starting a coffee shop in Las Piñas. I need a commercial coffee machine, coffee beans, disposable cups, and packaging suppliers. My budget is ₱100,000.";

describe("splitNeeds", () => {
  it("splits the coffee-shop request into four ordered needs", () => {
    expect(splitNeeds(COFFEE).map((n) => n.text)).toEqual([
      "a commercial coffee machine",
      "coffee beans",
      "disposable cups",
      "packaging suppliers",
    ]);
  });

  it("keeps the part after a colon and drops the budget", () => {
    expect(splitNeeds("Starting a café: disposable cups, coffee beans, POS terminal, budget ₱100,000").map((n) => n.text)).toEqual([
      "disposable cups",
      "coffee beans",
      "POS terminal",
    ]);
  });

  it("handles a single need, '&' and 'and'", () => {
    expect(splitNeeds("custom shirts")).toEqual([{ text: "custom shirts", quantity: null }]);
    expect(splitNeeds("Online shop packaging: 500 mailer boxes and thermal labels").map((n) => n.text)).toEqual([
      "500 mailer boxes",
      "thermal labels",
    ]);
  });

  it("returns [] for empty input", () => {
    expect(splitNeeds("")).toEqual([]);
    expect(splitNeeds("  , ; ")).toEqual([]);
  });

  it("drops case-insensitive duplicates and caps at 8", () => {
    expect(splitNeeds("cups, Cups, lids").map((n) => n.text)).toEqual(["cups", "lids"]);
    expect(splitNeeds("aaa, bbb, ccc, ddd, eee, fff, ggg, hhh, iii, jjj")).toHaveLength(8);
  });

  it("extracts quantity", () => {
    expect(splitNeeds("500 kraft bags")[0].quantity).toBe(500);
    expect(splitNeeds("10,000 pouches")[0]).toEqual({ text: "10,000 pouches", quantity: 10000 });
  });
});

describe("parseBudgetCentavos", () => {
  it("parses pesos, commas and k suffix as integer centavos", () => {
    expect(parseBudgetCentavos(COFFEE)).toBe(10000000);
    expect(parseBudgetCentavos("budget of 100k")).toBe(10000000);
    expect(parseBudgetCentavos("under ₱5,000")).toBe(500000);
    expect(parseBudgetCentavos("budget PHP 2,500")).toBe(250000);
  });

  it("ignores decimals and missing budgets", () => {
    expect(parseBudgetCentavos("budget ₱100.50")).toBeNull();
    expect(parseBudgetCentavos("500 kraft bags")).toBeNull();
    expect(parseBudgetCentavos("")).toBeNull();
  });
});
