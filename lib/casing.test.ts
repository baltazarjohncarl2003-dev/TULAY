import { describe, expect, it } from "vitest";
import { PUBLIC_NAV, ROLE_NAV } from "@/components/nav";
import { CATEGORIES } from "./categories";
import { sentence, titleCase } from "./format";

describe("titleCase", () => {
  it("capitalises words, keeps small words and acronyms", () => {
    expect(titleCase("look for suppliers")).toBe("Look for Suppliers");
    expect(titleCase("a request for quotation")).toBe("A Request for Quotation");
    expect(titleCase("customized IDs")).toBe("Customized IDs");
    expect(titleCase("boxes & cartons")).toBe("Boxes & Cartons");
  });
  it("sentence-cases status values", () => expect(sentence("in_production")).toBe("In production"));
});

// docs/style-guide.md: every menu and category label is Title Case.
describe("labels", () => {
  const labels = [...PUBLIC_NAV, ...Object.values(ROLE_NAV).flat()].map((n) => n.label).concat(CATEGORIES.map((c) => c.name));
  it.each(labels)("%s is Title Case", (l) => expect(l).toBe(titleCase(l)));
});
