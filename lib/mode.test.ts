import { describe, expect, it } from "vitest";
import { publicNav } from "@/components/nav";
import { isPrefetch, modeForPath, parseMode } from "./mode";

const labels = (...args: Parameters<typeof publicNav>) => publicNav(...args).map((n) => n.label);

describe("modeForPath", () => {
  it("maps workspace paths to a mode", () => {
    expect(modeForPath("/buyer")).toBe("buying");
    expect(modeForPath("/buyer/cart")).toBe("buying");
    expect(modeForPath("/supplier/products")).toBe("selling");
    expect(modeForPath("/buyers")).toBeNull();
    expect(modeForPath("/")).toBeNull();
  });
  it("rejects unknown cookie values", () => expect(parseMode("admin")).toBeNull());
  it("spots prefetches, not real visits", () => {
    expect(isPrefetch(new Headers({ "next-router-prefetch": "1" }))).toBe(true);
    expect(isPrefetch(new Headers({ "next-router-segment-prefetch": "/_tree" }))).toBe(true);
    expect(isPrefetch(new Headers({ "sec-purpose": "prefetch;prerender" }))).toBe(true);
    expect(isPrefetch(new Headers({ accept: "text/html" }))).toBe(false);
  });
});

describe("publicNav", () => {
  it("signed out shows both request links", () => {
    expect(labels(null, true)).toEqual([
      "Home", "AI Mode", "Products", "Services", "Suppliers", "Post a Request", "Buyer Requests", "How It Works",
    ]);
  });
  it("buying hides Buyer Requests, selling hides Post a Request", () => {
    expect(labels("buying", true)).not.toContain("Buyer Requests");
    expect(labels("selling", true)).not.toContain("Post a Request");
  });
  it("hides Services when none are live", () => expect(labels(null, false)).not.toContain("Services"));
});
