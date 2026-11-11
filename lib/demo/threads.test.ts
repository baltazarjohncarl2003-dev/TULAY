import { describe, expect, it } from "vitest";
import { buildThreads, filterThreads } from "./threads";

const viewer = { buyerId: "u-buyer", supplierId: "s1" };

describe("buildThreads", () => {
  it("buyer sees only their own RFQs' threads, with supplier names", () => {
    const t = buildThreads("buyer", viewer);
    expect(t.map((x) => x.id).sort()).toEqual(["r1:s1", "r1:s3", "r2:s2"]);
    expect(t.every((x) => !x.counterpartyName.startsWith("Buyer"))).toBe(true);
  });

  it("supplier sees only their invites and the buyer stays anonymous", () => {
    const t = buildThreads("supplier", viewer);
    expect(t.map((x) => x.id)).toEqual(["r1:s1", "r6:s1"]);
    expect(t[0].counterpartyName).toBe(`Buyer · ${t[0].rfqRef}`);
  });

  it("excludes declined invites", () => {
    expect(buildThreads("buyer", viewer).some((x) => x.id === "r2:s1")).toBe(false);
    expect(buildThreads("supplier", viewer).some((x) => x.id === "r2:s1")).toBe(false);
  });

  it("sorts newest message first, threads without messages last", () => {
    const t = buildThreads("buyer", viewer);
    expect(t.map((x) => x.id)).toEqual(["r1:s3", "r1:s1", "r2:s2"]);
    expect(t[2].lastAt).toBeNull();
  });

  it("orders messages oldest first and names the latest quote", () => {
    const t = buildThreads("buyer", viewer).find((x) => x.id === "r1:s1")!;
    expect(t.messages.map((m) => m.id)).toEqual(["m1", "m2"]);
    expect(t.latestQuoteRef).toBe("QT-0002 rev 2");
  });
});

describe("filterThreads", () => {
  const threads = buildThreads("buyer", viewer);
  it("matches a message body, case-insensitively", () => {
    expect(filterThreads(threads, "MOCKUP").map((x) => x.id)).toEqual(["r1:s1"]);
  });
  it("matches ref and product, and returns all for a blank query", () => {
    expect(filterThreads(threads, "rfq-2026-0002").map((x) => x.id)).toEqual(["r2:s2"]);
    expect(filterThreads(threads, "mailer boxes")).toHaveLength(1);
    expect(filterThreads(threads, "  ")).toHaveLength(3);
  });
  it("returns nothing when no match", () => {
    expect(filterThreads(threads, "zzzz")).toEqual([]);
  });
});
