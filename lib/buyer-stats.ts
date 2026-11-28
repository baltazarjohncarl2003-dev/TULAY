import type { DealBundle, DealCounts } from "@/lib/data/deals";
import { latestQuotesOf } from "@/lib/quotes";
import type { Claim, Offer, Order, Rfq } from "@/lib/types";

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
/**
 * Dashboard tiles. All-time totals come from `counts` (the database); "awaiting you" is worked out from the open
 * RFQs in `deals` (every invited or quoting RFQ is open, so the dashboard bundle holds them all).
 */
export function buyerStats(
  deals: Pick<DealBundle, "rfqs" | "quotes" | "selections">,
  counts: Pick<DealCounts, "buyerOpenRfqs" | "buyerLatestQuotes" | "buyerSelections">,
  buyerId: string,
  today: string,
) {
  const mine = deals.rfqs.filter((r) => r.buyerId === buyerId);
  const selected = new Set(deals.selections.filter((s) => s.buyerId === buyerId).map((s) => s.supplierId));
  const awaiting = mine
    .filter((r) => r.status === "invited" || r.status === "quoting")
    .flatMap((r) => latestQuotesOf(deals.quotes, r.id))
    .filter((q) => !selected.has(q.supplierId) && q.validUntil >= today);
  return {
    openRfqs: counts.buyerOpenRfqs,
    quotesReceived: counts.buyerLatestQuotes,
    awaitingYou: awaiting.length,
    suppliersSelected: counts.buyerSelections,
  };
}

export type BuyerAction = { key: string; text: string; href: string };

const CLOSED_CLAIM: Claim["status"][] = ["resolved", "declined", "rejected", "cancelled"];

/** The buyer's to-dos across orders and claims. Display only: each target page enforces its own rules. */
export function buyerActions(orders: Order[], claims: Claim[]): BuyerAction[] {
  const out: BuyerAction[] = [];
  for (const o of orders) {
    const href = `/buyer/orders/${o.id}`;
    if (o.status === "pending_payment") out.push({ key: `pay-${o.id}`, text: `Pay for order ${o.ref}`, href });
    if (!o.proofApprovedAt && o.proofs.at(-1)?.status === "sent") out.push({ key: `proof-${o.id}`, text: `Approve proof for ${o.ref}`, href });
    // Same condition as the order page: courier parcels confirm themselves from tracking.
    if (o.status === "shipped" && o.fulfilmentMode !== "courier") out.push({ key: `recv-${o.id}`, text: `Confirm delivery of ${o.ref}`, href });
  }
  for (const c of claims) {
    if (!CLOSED_CLAIM.includes(c.status)) out.push({ key: `claim-${c.id}`, text: `Open claim ${c.ref} on ${c.orderRef}`, href: `/buyer/claims/${c.id}` });
  }
  return out;
}
