import { RFQS, SELECTIONS, latestQuotes } from "@/lib/demo/data";
import type { Offer, Rfq } from "@/lib/demo/types";

export type PipelineStage = "draft" | "in_review" | "quoting" | "negotiating" | "closed";

export function pipelineStage(rfq: Rfq, offers: Offer[]): PipelineStage {
  switch (rfq.status) {
    case "draft":
      return "draft";
    case "under_review":
    case "needs_information":
    case "matching":
      return "in_review";
    case "invited":
    case "quoting":
      return offers.some((o) => o.rfqId === rfq.id && o.action === "counter") ? "negotiating" : "quoting";
    default:
      return "closed";
  }
}

/** `today` is YYYY-MM-DD (Manila), passed in so this stays pure. */
export function buyerStats(buyerId: string, today: string) {
  const mine = RFQS.filter((r) => r.buyerId === buyerId);
  const selections = SELECTIONS.filter((s) => s.buyerId === buyerId);
  const selected = new Set(selections.map((s) => s.supplierId));
  const quotes = mine.flatMap((r) => latestQuotes(r.id));
  const awaiting = mine
    .filter((r) => r.status === "invited" || r.status === "quoting")
    .flatMap((r) => latestQuotes(r.id))
    .filter((q) => !selected.has(q.supplierId) && q.validUntil >= today);
  return {
    openRfqs: mine.filter((r) => r.status !== "draft" && r.status !== "supplier_selected" && r.status !== "cancelled").length,
    quotesReceived: quotes.length,
    awaitingYou: awaiting.length,
    suppliersSelected: selections.length,
  };
}
