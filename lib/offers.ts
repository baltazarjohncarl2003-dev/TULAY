import type { Unit } from "@/lib/types";

/**
 * One row of a chat negotiation (table chat_offers, append-only). A proposal (offer or counter) is a numbered
 * revision with full terms; accept, reject and withdraw answer one proposal and copy its terms. Money is integer
 * centavos worked out by the server; the browser only displays it.
 */
export type ChatOffer = {
  id: string;
  seq: number;
  actorId: string;
  action: "offer" | "counter" | "accept" | "reject" | "withdraw";
  revision: number;
  relatedOfferId: string | null;
  productName: string;
  productType: string;
  specs: string;
  unit: Unit;
  quantity: number;
  unitPriceCentavos: number;
  shippingFeeCentavos: number;
  subtotalCentavos: number;
  totalCentavos: number;
  downpaymentBps: number; // 5000 = 50%
  downpaymentCentavos: number;
  leadDays: number;
  paymentTerms: string;
  conditions: string;
  validUntil: string;
  createdAt: string;
};

export type OfferStatus = "open" | "countered" | "accepted" | "rejected" | "withdrawn" | "expired";

export const isProposal = (o: ChatOffer) => o.action === "offer" || o.action === "counter";

const ANSWER_STATUS: Record<Exclude<ChatOffer["action"], "offer">, OfferStatus> = {
  counter: "countered",
  accept: "accepted",
  reject: "rejected",
  withdraw: "withdrawn",
};

/** A proposal's state, mirroring the server: answered (by whatever answered it), else expired, else open. */
export function offerStatus(offers: ChatOffer[], proposal: ChatOffer, now: number): OfferStatus {
  const answer = offers.find((o) => o.relatedOfferId === proposal.id);
  if (answer && answer.action !== "offer") return ANSWER_STATUS[answer.action];
  return new Date(proposal.validUntil).getTime() > now ? "open" : "expired";
}

/** The chat's open proposal, if any (at most one: a new proposal always answers the open one). */
export function openOffer(offers: ChatOffer[], now: number): ChatOffer | null {
  const latest = offers.filter(isProposal).at(-1);
  return latest && offerStatus(offers, latest, now) === "open" ? latest : null;
}

/** "50%" or "33.5%" from basis points. */
export function percentLabel(bps: number): string {
  return `${(bps / 100).toFixed(2).replace(/\.?0+$/, "")}%`;
}

/** Basis points as the text a percent field shows ("50", "33.5"). */
export function bpsToPercentInput(bps: number): string {
  return percentLabel(bps).slice(0, -1);
}
