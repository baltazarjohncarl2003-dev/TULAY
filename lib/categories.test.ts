import { describe, expect, it } from "vitest";
import { inCategory } from "./categories";

describe("inCategory", () => {
  it("matches all, itself and its children only", () => {
    expect(inCategory("dtf-prints", "all")).toBe(true);
    expect(inCategory("dtf-prints", "dtf-prints")).toBe(true);
    expect(inCategory("dtf-prints", "packaging")).toBe(true);
    expect(inCategory("dtf-prints", "clothing-textiles")).toBe(false);
  });
});
