// Frontend-first types, shaped like the future Postgres rows. Money is integer centavos.

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
};

export type ReturnClass = "standard" | "custom" | "final_sale";
export type ProductStatus = "pending" | "approved" | "rejected";
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
  status: RfqStatus;
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
};

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

export type Notification = { id: string; userId: string; title: string; body: string; createdAt: string };

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
