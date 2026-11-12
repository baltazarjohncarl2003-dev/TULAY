// Domain types, shaped like the Postgres rows (the data layer maps rows onto them). Money is integer centavos.

export type Role = "buyer" | "supplier" | "admin";

export type Category = { id: string; slug: string; name: string; parentSlug: string | null };

export type SupplierStatus = "pending" | "approved" | "rejected" | "suspended";
export type Supplier = {
  id: string;
  ownerId: string;
  businessName: string;
  legalName: string;
  categorySlug: string;
  city: string;
  province: string;
  description: string;
  moq: number;
  leadDays: number;
  status: SupplierStatus;
  deliveryAreas: string[];
  keywords: string;
  autoInvites: boolean;
  maxQuantity: number | null;
  businessType: BusinessType;
  /** Restocking fee the supplier asks on change-of-mind returns (basis points); the platform cap may lower it. */
  restockingFeeBps?: number;
  /** Self-reported by the supplier, not verified by TULAY. null = not stated. */
  yearsOperating: number | null;
};

export type BusinessType = "manufacturer" | "supplier" | "wholesaler" | "distributor" | "service_provider";

export type ReturnClass = "standard" | "custom" | "final_sale";
export type ProductStatus = "draft" | "pending" | "approved" | "rejected";
export type Unit = "pcs" | "boxes" | "packs" | "sets" | "kg";
export type Product = {
  id: string;
  supplierId: string;
  categorySlug: string;
  title: string;
  description: string;
  moq: number;
  unit: Unit;
  indicativePriceCentavos: number | null;
  leadDays: number | null;
  imageUrl: string | null;
  status: ProductStatus;
  returnClass: ReturnClass;
  createdAt: string;
  /** Services are quoted per package; use unit "sets". */
  listingType: "product" | "service";
  /** Quantity breaks above the MOQ, ascending. Loaded on detail views only. */
  priceTiers?: PriceTier[];
  /** All image URLs in display order (imageUrl is the first). Loaded on detail views only. */
  imageUrls?: string[];
  /** Options (size, colour...). Loaded on detail views only. */
  variants?: ProductVariant[];
  /** Units on hand when the listing has no options; null = not tracked. */
  stock?: number | null;
  /** Admin's reason when rejected. Shown to the owner only. */
  reviewNote?: string;
};

export type PromotionTheme = "red" | "rose" | "amber" | "slate";
export type Promotion = {
  id: string;
  eyebrow: string;
  headline: string;
  subheading: string;
  ctaLabel: string;
  categorySlug: string | null;
  theme: PromotionTheme;
  imageUrl: string | null;
  sortOrder: number;
  status: "active" | "paused";
};

export type RfqStatus =
  | "draft"
  | "under_review"
  | "needs_information"
  | "matching"
  | "invited"
  | "quoting"
  | "supplier_selected"
  | "cancelled";
export type Rfq = {
  id: string;
  ref: string;
  buyerId: string;
  product: string;
  categorySlug: string;
  description: string;
  specs: string;
  quantity: number;
  unit: Unit;
  city: string;
  province: string;
  requiredBy: string; // YYYY-MM-DD
  budgetCentavos: number | null;
  sharingConsent: boolean;
  deliveryPreference: DeliveryTerms | "any";
  needsBirInvoice: boolean;
  status: RfqStatus;
  /** TULAY's note when asking for more information or not approving. */
  reviewNote?: string;
  createdAt: string;
};

export type InviteStatus = "invited" | "accepted" | "declined";
export type RfqInvite = { rfqId: string; supplierId: string; status: InviteStatus };

export type Quote = {
  id: string;
  ref: string;
  rfqId: string;
  supplierId: string;
  revision: number;
  quantity: number;
  unitPriceCentavos: number;
  // null = supplier did not provide it (not zero).
  setupFeeCentavos: number | null;
  shippingFeeCentavos: number | null;
  taxCentavos: number | null;
  leadDays: number;
  validUntil: string; // YYYY-MM-DD
  paymentTerms: string;
  notes: string;
  createdAt: string;
  /** Extra quantity breaks, ascending minQty. Empty = unitPriceCentavos at every quantity. */
  priceTiers: PriceTier[];
  deliveryTerms: DeliveryTerms;
  birInvoice: BirInvoice;
};

/** unitPriceCentavos applies when the ordered quantity is at least minQty. */
export type PriceTier = { minQty: number; unitPriceCentavos: number };
export type DeliveryTerms = "supplier_delivery" | "buyer_pickup" | "third_party_freight";
export type BirInvoice = "vat" | "non_vat" | "none";

export type OfferAction = "counter" | "accept" | "decline";
export type Offer = {
  id: string;
  rfqId: string;
  supplierId: string;
  quoteId: string;
  actorId: string;
  action: OfferAction;
  quantity: number;
  unitPriceCentavos: number;
  leadDays: number;
  paymentTerms: string;
  message: string;
  relatedOfferId: string | null;
  createdAt: string;
};

export type Message = { id: string; rfqId: string; supplierId: string; senderId: string; body: string; createdAt: string };

export type Notification = { id: string; userId: string; title: string; body: string; createdAt: string; link?: string; readAt?: string | null };

export type Selection = {
  id: string;
  ref: string;
  rfqId: string;
  buyerId: string;
  supplierId: string;
  quoteId: string;
  amountCentavos: number;
  amountIsEstimate: boolean;
  status: "recorded";
};

export type Profile = {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: "active" | "suspended";
  phone: string;
  businessName: string;
  industry: string;
  city: string;
  province: string;
  website: string;
  about: string;
  updatedAt: string | null;
};

// ---- Stage 4: orders and money (integer centavos)

export type PaymentMethod = "card" | "ewallet" | "online_banking";
export type OrderStatus =
  | "pending_payment"
  | "paid"
  | "confirmed" // COD order accepted; balance collected on delivery
  | "in_production"
  | "shipped"
  | "delivered"
  | "completed"
  | "cancelled";
export type FulfilmentMode = "courier" | "supplier_delivery" | "buyer_pickup" | "freight";
export type ShipmentStatus = "booked" | "picked_up" | "in_transit" | "out_for_delivery" | "delivered" | "failed_attempt" | "returned";
export type Address = {
  id: string; label: string; recipient: string; phone: string; line1: string; line2: string;
  barangay: string; city: string; province: string; postalCode: string;
};
export type ShipTo = Omit<Address, "id" | "label">;
/** A listing option (size, colour...). stock null = not tracked. */
export type ProductVariant = { id: string; name: string; priceDeltaCentavos: number; stock: number | null };

export type CartLine = {
  id: string;
  productId: string;
  variantId: string | null;
  title: string;
  variantName: string;
  supplierId: string;
  supplierName: string;
  quantity: number;
  moq: number;
  unit: Unit;
  /** What checkout will charge per unit at this quantity; null = price on request (send an RFQ). */
  unitPriceCentavos: number | null;
  /** Units left; null = not tracked. */
  stock: number | null;
  imageUrl: string | null;
  /** false when the listing, option or supplier is no longer available. */
  available: boolean;
};

export type OrderItem = {
  id: string;
  title: string;
  variantName: string;
  unit: Unit;
  quantity: number;
  unitPriceCentavos: number;
  lineTotalCentavos: number;
  returnClass: ReturnClass;
};
export type RefundStatus = "pending" | "succeeded" | "failed";
export type Order = {
  id: string;
  ref: string;
  buyerId: string;
  supplierId: string;
  supplierName: string;
  status: OrderStatus;
  itemsCentavos: number;
  feesCentavos: number;
  totalCentavos: number;
  commissionCentavos: number;
  gatewayFeeCentavos: number;
  paidAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  items: OrderItem[];
  history: { toStatus: OrderStatus; reason: string; createdAt: string }[];
  refunds: { id: string; amountCentavos: number; status: RefundStatus; reason: string; createdAt: string }[];
  payment: { method: PaymentMethod; status: string; providerRef: string | null } | null;
  shippingCentavos: number;
  fulfilmentMode: FulfilmentMode;
  /** Frozen delivery address; null for buyer pickup. */
  shipTo: ShipTo | null;
  paymentOption: "online" | "cod";
  /** COD: amount paid online up front (custom items); the rest is collected on delivery. */
  downpaymentCentavos: number;
  paidOnlineCentavos: number;
  proofApprovedAt: string | null;
  deliveryClaimedAt: string | null;
  artwork: { id: string; storagePath: string; fileName: string; note: string; createdAt: string }[];
  /** Oldest first. */
  proofs: { id: string; version: number; storagePath: string; note: string; status: "sent" | "approved" | "changes_requested"; responseNote: string; createdAt: string }[];
  shipment: { carrier: string; trackingRef: string; status: ShipmentStatus; codAmountCentavos: number; events: { status: ShipmentStatus; note: string; occurredAt: string }[] } | null;
  /** True when any item is custom-made (needs artwork, proof and approval before production). */
  custom: boolean;
  /** Set for RFQ-deal orders. */
  selectionId: string | null;
};

// ---- Stage 6: after-sales

export type ClaimType = "damage" | "return" | "defect";
export type ClaimStatus =
  | "open"
  | "awaiting_return"
  | "refund_pending"
  | "replacement_pending"
  | "rejected"
  | "escalated"
  | "declined"
  | "resolved"
  | "cancelled";
export type Claim = {
  id: string;
  ref: string;
  orderId: string;
  orderRef: string;
  buyerId: string;
  supplierId: string;
  supplierName: string;
  /** Profile id of the supplier's owner (labels their messages in the claim thread). */
  supplierOwnerId: string;
  type: ClaimType;
  /** Order items concerned; empty = the whole order. */
  itemIds: string[];
  description: string;
  status: ClaimStatus;
  remedy: "refund" | "replacement" | null;
  /** Agreed refund before the restocking fee. */
  refundCentavos: number;
  restockingFeeCentavos: number;
  /** Refunded online through the gateway (null = none). */
  onlineRefund: { amountCentavos: number; status: RefundStatus } | null;
  /** COD cash the supplier pays back directly. */
  manualRefundCentavos: number;
  manualRefundRef: string;
  returnRequired: boolean;
  returnPayer: "buyer" | "supplier" | null;
  raNumber: string | null;
  returnTrackingRef: string;
  returnReceivedAt: string | null;
  responseNote: string;
  decisionNote: string;
  createdAt: string;
  resolvedAt: string | null;
  evidence: { storagePath: string; fileName: string }[];
  messages: { id: string; senderId: string; body: string; createdAt: string }[];
  history: { toStatus: ClaimStatus; note: string; createdAt: string }[];
};
export type Review = {
  id: string;
  orderId: string;
  supplierId: string;
  rating: number;
  body: string;
  supplierReply: string;
  repliedAt: string | null;
  hidden: boolean;
  hiddenReason: string;
  createdAt: string;
};
