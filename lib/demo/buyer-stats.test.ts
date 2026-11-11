import { describe, expect, it } from "vitest";
import { RFQS } from "@/lib/demo/data";
import type { Offer, Rfq, RfqStatus } from "@/lib/types";
import { buyerStats, pipelineStage } from "./buyer-stats";

const rfq = (status: RfqStatus): Rfq => ({ ...RFQS[0], id: "x", status });
const counter = { rfqId: "x", action: "counter" } as Offer;
const decline = { rfqId: "x", action: "decline" } as Offer;

describe("pipelineStage", () => {
  it("maps every status", () => {
    expect(pipelineStage(rfq("draft"), [])).toBe("draft");
    for (const s of ["under_review", "needs_information", "matching"] as const) {
      expect(pipelineStage(rfq(s), [])).toBe("in_review");
    }
    for (const s of ["invited", "quoting"] as const) {
      expect(pipelineStage(rfq(s), [])).toBe("quoting");
      expect(pipelineStage(rfq(s), [decline])).toBe("quoting");
      expect(pipelineStage(rfq(s), [counter])).toBe("negotiating");
    }
    expect(pipelineStage(rfq("supplier_selected"), [])).toBe("closed");
    expect(pipelineStage(rfq("cancelled"), [])).toBe("closed");
  });

  it("ignores counters on other RFQs", () => {
    expect(pipelineStage(rfq("quoting"), [{ ...counter, rfqId: "other" }])).toBe("quoting");
  });
});

describe("buyerStats on demo data", () => {
  it("counts for the demo buyer", () => {
    // r1 quoting, r2 invited, r3 under_review open; r4 draft. Latest quotes: q2 (to 11-30), q3 (to 11-25).
    expect(buyerStats("u-buyer", "2026-11-11")).toEqual({
      openRfqs: 3, quotesReceived: 2, awaitingYou: 2, suppliersSelected: 0,
    });
  });

  it("drops expired quotes from awaitingYou", () => {
    expect(buyerStats("u-buyer", "2026-11-26").awaitingYou).toBe(1);
    expect(buyerStats("u-buyer", "2026-12-01").awaitingYou).toBe(0);
  });

  it("counts selections and excludes closed RFQs", () => {
    expect(buyerStats("u-b2", "2026-11-11")).toEqual({
      openRfqs: 0, quotesReceived: 1, awaitingYou: 0, suppliersSelected: 1,
    });
  });
});
