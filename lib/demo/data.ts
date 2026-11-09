// shortcut: static sample data so every screen renders before the backend exists; replace with Supabase queries from Stage 1.
import type {
  Category,
  Message,
  Notification,
  Offer,
  Product,
  Profile,
  Promotion,
  Quote,
  Rfq,
  RfqInvite,
  Role,
  Selection,
  Supplier,
} from "./types";

export const CATEGORIES: Category[] = [
  { id: "c1", slug: "custom-shirts", name: "Custom shirts", parentSlug: null },
  { id: "c2", slug: "dtf-prints", name: "DTF prints", parentSlug: null },
  { id: "c3", slug: "sublimation", name: "Sublimation", parentSlug: null },
  { id: "c4", slug: "packaging", name: "Packaging", parentSlug: null },
  { id: "c5", slug: "customized-mugs", name: "Customized mugs", parentSlug: null },
  { id: "c6", slug: "customized-ids", name: "Customized IDs", parentSlug: null },
  // Legacy BUYSON categories, now under Packaging.
  { id: "c7", slug: "pouches", name: "Pouches & flexible packaging", parentSlug: "packaging" },
  { id: "c8", slug: "boxes", name: "Boxes & cartons", parentSlug: "packaging" },
  { id: "c9", slug: "bottles", name: "Bottles & jars", parentSlug: "packaging" },
  { id: "c10", slug: "labels", name: "Labels & stickers", parentSlug: "packaging" },
  { id: "c11", slug: "food-containers", name: "Cups & food containers", parentSlug: "packaging" },
  { id: "c12", slug: "paper-bags", name: "Paper bags", parentSlug: "packaging" },
  { id: "c13", slug: "mailers", name: "Mailer packaging", parentSlug: "packaging" },
  { id: "c14", slug: "other", name: "Other packaging", parentSlug: "packaging" },
];

export const LAUNCH_CATEGORIES = CATEGORIES.filter((c) => c.parentSlug === null);

export const DEMO_USERS: Record<Role, Profile> = {
  buyer: {
    id: "u-buyer",
    name: "Alex Reyes",
    email: "alex@kapebrew.ph",
    role: "buyer",
    status: "active",
    phone: "09171234567",
    businessName: "KapeBrew Café",
    industry: "Food and beverage",
    city: "Quezon City",
    province: "Metro Manila",
    website: "https://kapebrew.ph",
    about: "Specialty coffee shop sourcing branded packaging and merch.",
    updatedAt: "2026-11-02",
  },
  supplier: {
    id: "u-supplier",
    name: "Maria Santos",
    email: "maria@printhaus.ph",
    role: "supplier",
    status: "active",
    phone: "09181234567",
    businessName: "PrintHaus Manila",
    industry: "Printing",
    city: "Pasig",
    province: "Metro Manila",
    website: "https://printhaus.ph",
    about: "",
    updatedAt: "2026-10-28",
  },
  admin: {
    id: "u-admin",
    name: "Jun Dela Cruz",
    email: "ops@tulay.ph",
    role: "admin",
    status: "active",
    phone: "",
    businessName: "TULAY",
    industry: "",
    city: "",
    province: "",
    website: "",
    about: "",
    updatedAt: null,
  },
};

export const SUPPLIERS: Supplier[] = [
  {
    id: "s1",
    ownerId: "u-supplier",
    businessName: "PrintHaus Manila",
    legalName: "PrintHaus Trading Inc.",
    categorySlug: "custom-shirts",
    city: "Pasig",
    province: "Metro Manila",
    description: "Screen print, DTF and embroidery on cotton and dri-fit shirts. In-house design proofing within 24 hours.",
    moq: 24,
    leadDays: 7,
    status: "approved",
    deliveryAreas: ["Metro Manila", "Rizal", "Laguna"],
    keywords: "shirts, dtf, embroidery, uniforms",
    autoInvites: true,
    maxQuantity: 5000,
  },
  {
    id: "s2",
    ownerId: "u-s2",
    businessName: "Kahon Packaging Co.",
    legalName: "Kahon Packaging Corporation",
    categorySlug: "boxes",
    city: "Valenzuela",
    province: "Metro Manila",
    description: "Corrugated mailer boxes, folding cartons and printed paper bags for e-commerce and retail brands.",
    moq: 100,
    leadDays: 14,
    status: "approved",
    deliveryAreas: ["Nationwide"],
    keywords: "mailer box, carton, kraft bag",
    autoInvites: true,
    maxQuantity: null,
  },
  {
    id: "s3",
    ownerId: "u-s3",
    businessName: "Cebu SubliPrints",
    legalName: "Cebu SubliPrints Enterprises",
    categorySlug: "sublimation",
    city: "Mandaue",
    province: "Cebu",
    description: "Full-sublimation jerseys, mugs and tumblers. Small runs welcome.",
    moq: 12,
    leadDays: 5,
    status: "approved",
    deliveryAreas: ["Cebu", "Visayas"],
    keywords: "jersey, mug, tumbler, sublimation",
    autoInvites: false,
    maxQuantity: 2000,
  },
  {
    id: "s4",
    ownerId: "u-s4",
    businessName: "IDentity Cards PH",
    legalName: "IDentity Solutions OPC",
    categorySlug: "customized-ids",
    city: "Davao City",
    province: "Davao del Sur",
    description: "PVC ID cards, lanyards and badge holders with variable-data printing.",
    moq: 50,
    leadDays: 4,
    status: "approved",
    deliveryAreas: ["Mindanao", "Nationwide"],
    keywords: "id card, lanyard, pvc",
    autoInvites: true,
    maxQuantity: 10000,
  },
  {
    id: "s5",
    ownerId: "u-s5",
    businessName: "Supot Pouch Works",
    legalName: "Supot Pouch Works Inc.",
    categorySlug: "pouches",
    city: "Biñan",
    province: "Laguna",
    description: "Stand-up zipper pouches and sachets, food-grade laminates.",
    moq: 500,
    leadDays: 21,
    status: "pending",
    deliveryAreas: ["Luzon"],
    keywords: "pouch, sachet, laminate",
    autoInvites: false,
    maxQuantity: null,
  },
];

export const PRODUCTS: Product[] = [
  { id: "p1", supplierId: "s1", categorySlug: "custom-shirts", title: "Cotton crew-neck shirt with 1-colour print", description: "180gsm combed cotton, sizes XS–3XL. Screen print front, up to A4 size.", moq: 24, unit: "pcs", indicativePriceCentavos: 28500, leadDays: 7, imageUrl: null, status: "approved", returnClass: "custom", createdAt: "2026-10-01" },
  { id: "p2", supplierId: "s1", categorySlug: "dtf-prints", title: "DTF transfer sheets, gang sheet 22×60 in", description: "Hot-peel DTF transfers ready to press. Send your artwork, we gang it.", moq: 5, unit: "pcs", indicativePriceCentavos: 45000, leadDays: 3, imageUrl: null, status: "approved", returnClass: "custom", createdAt: "2026-10-04" },
  { id: "p3", supplierId: "s1", categorySlug: "custom-shirts", title: "Embroidered polo shirt", description: "Pique polo with left-chest embroidery, up to 8,000 stitches.", moq: 12, unit: "pcs", indicativePriceCentavos: 52000, leadDays: 10, imageUrl: null, status: "pending", returnClass: "custom", createdAt: "2026-11-05" },
  { id: "p4", supplierId: "s2", categorySlug: "mailers", title: "Printed corrugated mailer box", description: "E-flute mailer, 1-colour outside print, sizes from 6×4×2 in.", moq: 100, unit: "pcs", indicativePriceCentavos: 3200, leadDays: 14, imageUrl: null, status: "approved", returnClass: "custom", createdAt: "2026-09-20" },
  { id: "p5", supplierId: "s2", categorySlug: "paper-bags", title: "Kraft paper bag with twisted handle", description: "120gsm kraft, 1-colour logo print, three standard sizes.", moq: 500, unit: "pcs", indicativePriceCentavos: 1450, leadDays: 12, imageUrl: null, status: "approved", returnClass: "custom", createdAt: "2026-09-22" },
  { id: "p6", supplierId: "s2", categorySlug: "boxes", title: "Plain folding carton (stock)", description: "White folding cartons in stock sizes, no print.", moq: 200, unit: "pcs", indicativePriceCentavos: 900, leadDays: 2, imageUrl: null, status: "approved", returnClass: "standard", createdAt: "2026-09-25" },
  { id: "p7", supplierId: "s3", categorySlug: "sublimation", title: "Full-sublimation basketball jersey set", description: "Jersey and shorts, unlimited colours, names and numbers included.", moq: 12, unit: "sets", indicativePriceCentavos: 65000, leadDays: 7, imageUrl: null, status: "approved", returnClass: "custom", createdAt: "2026-10-10" },
  { id: "p8", supplierId: "s3", categorySlug: "customized-mugs", title: "11 oz sublimation mug, full wrap", description: "White ceramic mug, dishwasher-safe coating, gift box optional.", moq: 24, unit: "pcs", indicativePriceCentavos: 12000, leadDays: 5, imageUrl: null, status: "approved", returnClass: "custom", createdAt: "2026-10-12" },
  { id: "p9", supplierId: "s3", categorySlug: "customized-mugs", title: "Stainless tumbler 20 oz, laser engraved", description: "Double-wall insulated tumbler with your logo engraved.", moq: 24, unit: "pcs", indicativePriceCentavos: null, leadDays: null, imageUrl: null, status: "approved", returnClass: "custom", createdAt: "2026-10-15" },
  { id: "p10", supplierId: "s4", categorySlug: "customized-ids", title: "PVC ID card, both sides printed", description: "CR80 PVC with variable names and photos. Lanyard sold separately.", moq: 50, unit: "pcs", indicativePriceCentavos: 3500, leadDays: 4, imageUrl: null, status: "approved", returnClass: "custom", createdAt: "2026-10-18" },
  { id: "p11", supplierId: "s4", categorySlug: "customized-ids", title: "Printed lanyard with metal hook", description: "20mm polyester lanyard, full-colour sublimation print.", moq: 100, unit: "pcs", indicativePriceCentavos: 4500, leadDays: 6, imageUrl: null, status: "pending", returnClass: "custom", createdAt: "2026-11-06" },
  { id: "p12", supplierId: "s4", categorySlug: "labels", title: "Vinyl sticker labels, die-cut", description: "Waterproof vinyl, any shape.", moq: 500, unit: "pcs", indicativePriceCentavos: 250, leadDays: 5, imageUrl: null, status: "rejected", returnClass: "final_sale", createdAt: "2026-10-30" },
];

export const PROMOTIONS: Promotion[] = [
  { id: "pr1", eyebrow: "New on TULAY", headline: "Custom shirts for your team, from 24 pieces.", subheading: "Compare print shops by MOQ, lead time and price. Send one request and get quotes.", ctaLabel: "Browse shirts", categorySlug: "custom-shirts", theme: "red", imageUrl: null, sortOrder: 0, status: "active" },
  { id: "pr2", eyebrow: "Built for Philippine brands", headline: "Packaging that makes your brand stand out.", subheading: "Mailer boxes, kraft bags, pouches and labels from verified suppliers.", ctaLabel: "Explore packaging", categorySlug: "packaging", theme: "amber", imageUrl: null, sortOrder: 1, status: "active" },
  { id: "pr3", eyebrow: "Corporate giveaways", headline: "Mugs and IDs, personalised for every name.", subheading: "Sublimation mugs, tumblers and PVC IDs with variable data.", ctaLabel: "See giveaways", categorySlug: "customized-mugs", theme: "slate", imageUrl: null, sortOrder: 2, status: "paused" },
];

export const RFQS: Rfq[] = [
  { id: "r1", ref: "RFQ-2026-0001", buyerId: "u-buyer", product: "Branded staff shirts", categorySlug: "custom-shirts", description: "Black crew-neck shirts with our café logo for 40 staff.", specs: "Cotton 180gsm, logo front A5, sizes S–XL, 1-colour white print.", quantity: 40, unit: "pcs", city: "Quezon City", province: "Metro Manila", requiredBy: "2026-12-05", budgetCentavos: 1400000, sharingConsent: true, status: "quoting", createdAt: "2026-11-01" },
  { id: "r2", ref: "RFQ-2026-0002", buyerId: "u-buyer", product: "Printed coffee mailer boxes", categorySlug: "mailers", description: "Mailer box for 2 coffee bags, shipped to online customers.", specs: "E-flute, 8×6×3 in, 1-colour outside print.", quantity: 1000, unit: "pcs", city: "Quezon City", province: "Metro Manila", requiredBy: "2027-01-15", budgetCentavos: null, sharingConsent: true, status: "invited", createdAt: "2026-11-04" },
  { id: "r3", ref: "RFQ-2026-0003", buyerId: "u-buyer", product: "Holiday mugs for regulars", categorySlug: "customized-mugs", description: "Gift mugs with our holiday design.", specs: "11 oz white mug, full wrap, gift box.", quantity: 200, unit: "pcs", city: "Quezon City", province: "Metro Manila", requiredBy: "2026-12-10", budgetCentavos: 3000000, sharingConsent: true, status: "under_review", createdAt: "2026-11-07" },
  { id: "r4", ref: "RFQ-2026-0004", buyerId: "u-buyer", product: "Kraft takeaway bags", categorySlug: "paper-bags", description: "", specs: "", quantity: 2000, unit: "pcs", city: "Quezon City", province: "Metro Manila", requiredBy: "2027-02-01", budgetCentavos: null, sharingConsent: false, status: "draft", createdAt: "2026-11-08" },
  { id: "r5", ref: "RFQ-2026-0005", buyerId: "u-b2", product: "Company ID cards and lanyards", categorySlug: "customized-ids", description: "IDs for 300 employees.", specs: "PVC CR80, both sides, printed lanyard.", quantity: 300, unit: "sets", city: "Makati", province: "Metro Manila", requiredBy: "2026-11-30", budgetCentavos: null, sharingConsent: true, status: "supplier_selected", createdAt: "2026-10-20" },
  { id: "r6", ref: "RFQ-2026-0006", buyerId: "u-b3", product: "Team jerseys for barangay league", categorySlug: "sublimation", description: "Need 15 jersey sets.", specs: "Full sublimation, names and numbers.", quantity: 15, unit: "sets", city: "Cebu City", province: "Cebu", requiredBy: "2026-12-01", budgetCentavos: null, sharingConsent: true, status: "matching", createdAt: "2026-11-06" },
];

export const INVITES: RfqInvite[] = [
  { rfqId: "r1", supplierId: "s1", status: "accepted" },
  { rfqId: "r1", supplierId: "s3", status: "accepted" },
  { rfqId: "r2", supplierId: "s2", status: "invited" },
  { rfqId: "r2", supplierId: "s1", status: "declined" },
  { rfqId: "r5", supplierId: "s4", status: "accepted" },
  { rfqId: "r6", supplierId: "s1", status: "invited" },
];

export const QUOTES: Quote[] = [
  { id: "q1", ref: "QT-0001", rfqId: "r1", supplierId: "s1", revision: 1, quantity: 40, unitPriceCentavos: 32000, setupFeeCentavos: 50000, shippingFeeCentavos: null, taxCentavos: null, leadDays: 7, validUntil: "2026-11-30", paymentTerms: "50% downpayment, balance before shipping", notes: "Includes one free proof revision.", createdAt: "2026-11-02" },
  { id: "q2", ref: "QT-0002", rfqId: "r1", supplierId: "s1", revision: 2, quantity: 40, unitPriceCentavos: 29500, setupFeeCentavos: 50000, shippingFeeCentavos: 25000, taxCentavos: 0, leadDays: 7, validUntil: "2026-11-30", paymentTerms: "50% downpayment, balance before shipping", notes: "Revised after counteroffer.", createdAt: "2026-11-04" },
  { id: "q3", ref: "QT-0003", rfqId: "r1", supplierId: "s3", revision: 1, quantity: 40, unitPriceCentavos: 34000, setupFeeCentavos: null, shippingFeeCentavos: 60000, taxCentavos: null, leadDays: 6, validUntil: "2026-11-25", paymentTerms: "Full payment upfront", notes: "", createdAt: "2026-11-03" },
  { id: "q4", ref: "QT-0004", rfqId: "r5", supplierId: "s4", revision: 1, quantity: 300, unitPriceCentavos: 7500, setupFeeCentavos: 0, shippingFeeCentavos: 35000, taxCentavos: 270000, leadDays: 4, validUntil: "2026-11-15", paymentTerms: "50% downpayment", notes: "", createdAt: "2026-10-22" },
];

export const OFFERS: Offer[] = [
  { id: "o1", rfqId: "r1", supplierId: "s1", quoteId: "q1", actorId: "u-buyer", action: "counter", quantity: 40, unitPriceCentavos: 28000, leadDays: 7, paymentTerms: "50% downpayment, balance before shipping", message: "Can you do ₱280 if we add a back print next month?", relatedOfferId: null, createdAt: "2026-11-03" },
  { id: "o2", rfqId: "r1", supplierId: "s1", quoteId: "q1", actorId: "u-supplier", action: "decline", quantity: 40, unitPriceCentavos: 28000, leadDays: 7, paymentTerms: "50% downpayment, balance before shipping", message: "We can't go that low, but we revised the quote to ₱295.", relatedOfferId: "o1", createdAt: "2026-11-04" },
  { id: "o3", rfqId: "r1", supplierId: "s3", quoteId: "q3", actorId: "u-s3", action: "counter", quantity: 40, unitPriceCentavos: 33000, leadDays: 6, paymentTerms: "Full payment upfront", message: "We can do ₱330 if you confirm this week.", relatedOfferId: null, createdAt: "2026-11-05" },
];

export const MESSAGES: Message[] = [
  { id: "m1", rfqId: "r1", supplierId: "s1", senderId: "u-buyer", body: "Hi! Can you send a mockup with the logo in white?", createdAt: "2026-11-02" },
  { id: "m2", rfqId: "r1", supplierId: "s1", senderId: "u-supplier", body: "Sure, sending a proof by tomorrow. Do you want a back print too?", createdAt: "2026-11-02" },
  { id: "m3", rfqId: "r1", supplierId: "s3", senderId: "u-s3", body: "Hello! We're in Cebu, shipping to QC takes 3–4 days.", createdAt: "2026-11-03" },
];

export const NOTIFICATIONS: Notification[] = [
  { id: "n1", userId: "u-buyer", title: "New quotation", body: "PrintHaus Manila revised their quote for RFQ-2026-0001.", createdAt: "2026-11-04" },
  { id: "n2", userId: "u-buyer", title: "Counteroffer received", body: "Cebu SubliPrints sent a counteroffer on RFQ-2026-0001.", createdAt: "2026-11-05" },
  { id: "n3", userId: "u-supplier", title: "New RFQ invitation", body: "You were invited to quote on RFQ-2026-0006.", createdAt: "2026-11-06" },
  { id: "n4", userId: "u-admin", title: "Supplier application", body: "Supot Pouch Works submitted their company profile for review.", createdAt: "2026-11-06" },
];

export const SELECTIONS: Selection[] = [
  { id: "t1", ref: "SEL-2026-0001", rfqId: "r5", buyerId: "u-b2", supplierId: "s4", quoteId: "q4", amountCentavos: 2555000, amountIsEstimate: false, status: "recorded" },
];

// ---- lookups ----
export const categoryName = (slug: string) => CATEGORIES.find((c) => c.slug === slug)?.name ?? slug;
export const supplierById = (id: string) => SUPPLIERS.find((s) => s.id === id);
export const rfqById = (id: string) => RFQS.find((r) => r.id === id);
export const approvedSuppliers = () => SUPPLIERS.filter((s) => s.status === "approved");
/** Public catalog: approved products from approved suppliers only. */
export const publicProducts = () =>
  PRODUCTS.filter((p) => p.status === "approved" && supplierById(p.supplierId)?.status === "approved");
/** Latest revision per supplier for an RFQ. */
export function latestQuotes(rfqId: string): Quote[] {
  const latest = new Map<string, Quote>();
  for (const q of QUOTES.filter((q) => q.rfqId === rfqId)) {
    const old = latest.get(q.supplierId);
    if (!old || q.revision > old.revision) latest.set(q.supplierId, q);
  }
  return [...latest.values()];
}
/** The demo supplier account's own company. */
export const DEMO_SUPPLIER = SUPPLIERS[0];
