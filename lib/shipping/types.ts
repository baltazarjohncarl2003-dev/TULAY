// The one interface every courier sits behind (CLAUDE.md: external services behind adapters).

export type ShipmentStatus = "booked" | "picked_up" | "in_transit" | "out_for_delivery" | "delivered" | "failed_attempt" | "returned";

/** A verified courier webhook, reduced to what the database needs. */
export type TrackingEvent = {
  /** Courier event id; the database stores each one once, so redeliveries change nothing. */
  id: string;
  trackingRef: string;
  status: Exclude<ShipmentStatus, "booked">;
  occurredAt: string; // ISO timestamp
  note: string;
  /** COD cash collected at the door (remitted by the courier straight to the supplier); null when none. */
  codCollectedCentavos: number | null;
};

export type ShipTo = {
  recipient: string; phone: string; line1: string; line2: string; barangay: string; city: string; province: string; postalCode: string;
};

export interface CourierProvider {
  readonly name: "fake" | "ninjavan";
  /** Books a pickup for one order (on the supplier's own courier account). */
  book(input: { orderRef: string; shipTo: ShipTo; codAmountCentavos: number }): Promise<{ trackingRef: string }>;
  /** Checks the signature on a raw webhook body; null when it is not authentic. */
  verifyWebhook(rawBody: string, headers: Headers): TrackingEvent | null;
}
