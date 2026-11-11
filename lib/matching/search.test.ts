import { describe, expect, it } from "vitest";
import { PRODUCTS, SUPPLIERS, publicProducts } from "@/lib/demo/data";
import { SEARCH_LIMIT, smartSearch } from "./search";

const run = (q: string) => smartSearch(q, publicProducts(), SUPPLIERS);

describe("smartSearch", () => {
  it("parses the quantity with commas", () => {
    expect(run("I need 5,000 printed coffee pouches").parsed.quantity).toBe(5000);
  });

  it("drops stop words and numbers from keywords", () => {
    expect(run("I need 5,000 printed coffee pouches").parsed.keywords).toEqual(["printed", "coffee", "pouch"]);
  });

  it("finds shirts for the synonym 'tee'", () => {
    const hits = run("tee").hits;
    expect(hits.map((h) => h.product.id)).toContain("p1");
    expect(hits.find((h) => h.product.id === "p1")?.reasons).toContain("Title matches “shirt”");
  });

  it("finds the mug and tumbler products for 'tumbler'", () => {
    const ids = run("tumbler").hits.map((h) => h.product.id);
    expect(ids).toEqual(expect.arrayContaining(["p8", "p9"]));
  });

  it("never returns pending products", () => {
    const ids = smartSearch("shirt", PRODUCTS, SUPPLIERS).hits.map((h) => h.product.id);
    expect(ids).not.toContain("p3");
  });

  it("caps hits at the search limit", () => {
    const clones = Array.from({ length: 30 }, (_, i) => ({ ...PRODUCTS[0], id: `x${i}` }));
    const result = smartSearch("shirt", clones, SUPPLIERS);
    expect(result.total).toBe(30);
    expect(result.hits.length).toBe(SEARCH_LIMIT);
    expect(result.more).toBe(true);
  });

  it("returns no hits for a blank query", () => {
    const result = run("   ");
    expect(result.hits).toHaveLength(0);
    expect(result.total).toBe(0);
  });
});
