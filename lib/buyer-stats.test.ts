import { describe, expect, it } from "vitest";
import { OFFERS, QUOTES, RFQS, SELECTIONS } from "@/lib/demo/data";
import type { Claim, Offer, Order, Rfq, RfqStatus } from "@/lib/types";
import { buyerActions, buyerStats, pipelineStage } from "./buyer-stats";

const deals = { rfqs: RFQS, quotes: QUOTES, offers: OFFERS, selections: SELECTIONS };
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
    expect(buyerStats(deals, "u-buyer", "2026-11-11")).toEqual({
      openRfqs: 3, quotesReceived: 2, awaitingYou: 2, suppliersSelected: 0,
    });
  });

  it("drops expired quotes from awaitingYou", () => {
    expect(buyerStats(deals, "u-buyer", "2026-11-26").awaitingYou).toBe(1);
    expect(buyerStats(deals, "u-buyer", "2026-12-01").awaitingYou).toBe(0);
  });

  it("counts selections and excludes closed RFQs", () => {
    expect(buyerStats(deals, "u-b2", "2026-11-11")).toEqual({
      openRfqs: 0, quotesReceived: 1, awaitingYou: 0, suppliersSelected: 1,
    });
  });
});

describe("buyerActions", () => {
  const order = (o: Partial<Order>) => ({ id: "o1", ref: "ORD-1", status: "paid", proofApprovedAt: null, proofs: [], fulfilmentMode: "courier", ...o }) as Order;
  it("lists a proof waiting for approval, linking the order", () => {
    const got = buyerActions([order({ proofs: [{ status: "sent" } as Order["proofs"][number]] })], []);
    expect(got).toEqual([{ key: "proof-o1", text: "Approve proof for ORD-1", href: "/buyer/orders/o1" }]);
  });
  it("lists payments, pickups to confirm and open claims; skips closed ones", () => {
    const claims = [{ id: "c1", ref: "CL-1", orderRef: "ORD-1", status: "open" }, { id: "c2", status: "resolved" }] as Claim[];
    const got = buyerActions([order({ status: "pending_payment" }), order({ id: "o2", ref: "ORD-2", status: "shipped", fulfilmentMode: "buyer_pickup" })], claims);
    expect(got.map((a) => a.text)).toEqual(["Pay for order ORD-1", "Confirm delivery of ORD-2", "Open claim CL-1 on ORD-1"]);
  });
  it("is empty when nothing needs doing", () => {
    expect(buyerActions([order({ proofs: [{ status: "approved" } as Order["proofs"][number]] })], [])).toEqual([]);
  });
});
