import { describe, expect, it } from "vitest";
import { inCategory, liveCategories } from "./categories";

describe("inCategory", () => {
  it("matches all, itself and its children only", () => {
    expect(inCategory("dtf-prints", "all")).toBe(true);
    expect(inCategory("dtf-prints", "dtf-prints")).toBe(true);
    expect(inCategory("dtf-prints", "packaging")).toBe(true);
    expect(inCategory("dtf-prints", "clothing-textiles")).toBe(false);
  });
});

describe("liveCategories", () => {
  it("is empty without live listings", () => {
    expect(liveCategories({})).toEqual([]);
  });

  it("adds the parent of a live subcategory, in tree order", () => {
    expect(liveCategories({ "custom-shirts": 2 }).map((c) => c.slug)).toEqual(["clothing-textiles", "custom-shirts"]);
  });

  it("shows a top category with its own listings and no children", () => {
    expect(liveCategories({ packaging: 1 }).map((c) => c.slug)).toEqual(["packaging"]);
  });

  it("treats zero counts as absent", () => {
    expect(liveCategories({ "custom-shirts": 0, packaging: 0 })).toEqual([]);
  });
});
