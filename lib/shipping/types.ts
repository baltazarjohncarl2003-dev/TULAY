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

export type CarrierName = "fake" | "ninjavan" | "lalamove";

export type ShipTo = {
  recipient: string; phone: string; line1: string; line2: string; barangay: string; city: string; province: string; postalCode: string;
  lat?: number | null; lng?: number | null;
};

/** Where the supplier's parcels are picked up (supplier_pickup_settings); null until the supplier sets it. */
export type PickupFrom = Omit<ShipTo, "recipient"> & { name: string; parcelWeightGrams: number; serviceType?: string | null };

export type Stop = { lat: number; lng: number; address: string };
export type QuoteInput = { pickup: Stop; dropoff: Stop; serviceType: string | null };
/** A live delivery price. ref is the courier's quotation id; stopRefs are its pickup and drop-off stop ids. */
export type CourierQuote = { ref: string; amountCentavos: number; expiresAt: string; stopRefs: [string, string] };
export type Vehicle = { key: string; description: string; loadKg: number | null };

export type BookInput = {
  orderRef: string;
  shipTo: ShipTo;
  codAmountCentavos: number;
  pickupFrom: PickupFrom | null;
  quote?: CourierQuote;
};

/** priceCentavos / shareLink are null for couriers that do not report them. */
export type Booking = { trackingRef: string; priceCentavos: number | null; shareLink: string | null };

/** A verified courier webhook that is not a tracking update but needs the database to act. */
export type CourierAction =
  | { kind: "void"; id: string; trackingRef: string; reason: string }
  | { kind: "flag"; id: string; trackingRef: string; note: string }
  | { kind: "replace"; id: string; trackingRef: string; newTrackingRef: string };

export interface CourierProvider {
  readonly name: CarrierName;
  /** Live delivery price (couriers that price per trip). */
  quote?(input: QuoteInput): Promise<CourierQuote>;
  /** Vehicle choices for the supplier's pickup settings. */
  vehicles?(): Promise<Vehicle[]>;
  /** Books a pickup for one order. Throws CourierError (nothing booked) or CourierUncertainError (may be booked). */
  book(input: BookInput): Promise<Booking>;
  /** Checks the signature on a raw webhook body: null when not authentic, "ignored" for authentic events we don't track. */
  verifyWebhook(rawBody: string, headers: Headers): TrackingEvent | CourierAction | "ignored" | null;
}

/** A booking failure the supplier can act on (its message is shown as is); nothing was booked. Other errors show a generic message. */
export class CourierError extends Error {}

/** The booking may exist (timeout, 5xx, unreadable answer). Never retry; support checks the courier's dashboard. */
export class CourierUncertainError extends Error {}
