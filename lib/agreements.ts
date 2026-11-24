import type { OrderStatus, ReturnClass, ShipTo } from "@/lib/types";

/**
 * One version of the order details for an accepted chat offer (table deal_agreements, append-only). The buyer sets
 * shipTo, the supplier sets returnClass; each change is a new version and both parties confirm one exact version.
 */
export type Agreement = {
  id: string;
  acceptId: string; // the chat_offers 'accept' row it belongs to
  version: number;
  returnClass: ReturnClass | null;
  termsBody: string | null; // the terms as agreed, frozen with this version
  shipTo: ShipTo | null;
  confirmedBy: string[]; // user ids of the parties who confirmed this version
  createdAt: string;
};

/** The order a deal became. Money in integer centavos. */
export type DealOrder = {
  id: string;
  ref: string;
  agreementId: string;
  status: OrderStatus;
  paymentOption: "online" | "cod" | "split";
  totalCentavos: number;
  paidOnlineCentavos: number;
};

/** The newest version for an accepted offer, or null before anyone set a detail. */
export function latestAgreement(agreements: Agreement[], acceptId: string): Agreement | null {
  return agreements.filter((a) => a.acceptId === acceptId).sort((a, b) => b.version - a.version)[0] ?? null;
}

/** Complete once both the address and the return class are set. */
export const isComplete = (a: Agreement | null) => !!a && a.shipTo !== null && a.returnClass !== null;

/** Both parties confirmed this exact version. */
export const bothConfirmed = (a: Agreement | null) => !!a && a.confirmedBy.length >= 2;

/** The live (not cancelled) order for any version of this accepted offer. */
export function dealOrder(orders: DealOrder[], agreements: Agreement[], acceptId: string): DealOrder | null {
  const ids = new Set(agreements.filter((a) => a.acceptId === acceptId).map((a) => a.id));
  return orders.find((o) => ids.has(o.agreementId) && o.status !== "cancelled") ?? null;
}

export const RETURN_CLASS_LABEL: Record<ReturnClass, string> = {
  standard: "Standard (stock item)",
  custom: "Custom-made",
  final_sale: "Final sale",
};
