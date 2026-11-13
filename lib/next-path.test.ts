import { describe, expect, it } from "vitest";
import { safeNextPath } from "./next-path";

describe("safeNextPath", () => {
  it("keeps same-site paths with their query", () => {
    expect(safeNextPath("/buyer/rfqs/new?product=p1")).toBe("/buyer/rfqs/new?product=p1");
  });
  it("rejects other sites and tricks", () => {
    for (const bad of ["https://evil.com", "//evil.com", "/\\evil.com", "/\t/evil.com", "javascript:alert(1)", "buyer", "", null, 42]) {
      expect(safeNextPath(bad)).toBeNull();
    }
  });
  it("rejects auth pages to avoid loops", () => {
    expect(safeNextPath("/login?next=/x")).toBeNull();
    expect(safeNextPath("/mfa")).toBeNull();
  });
});
