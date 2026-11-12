import { z } from "zod";
import { toCentavos } from "@/lib/format";

// Limits from legacy BUYSON_POLICY / form maxlengths. Become admin settings with the backend.
export const MAX_QUANTITY = 10_000_000;

const text = (max: number) => z.string().trim().min(1, "Required").max(max);
const optionalText = (max: number) => z.string().trim().max(max).optional().default("");
const int = (min: number, max = MAX_QUANTITY) => z.coerce.number().int("Whole number").min(min).max(max);
const optionalInt = (min: number, max = MAX_QUANTITY) =>
  z.preprocess((v) => (v === "" || v == null ? null : v), z.coerce.number().int().min(min).max(max).nullable());
/** Peso text field -> integer centavos (null when blank). */
const money = z
  .string()
  .default("")
  .transform((v, ctx) => {
    try {
      return toCentavos(v);
    } catch (e) {
      ctx.addIssue({ code: "custom", message: (e as Error).message });
      return z.NEVER;
    }
  });
const requiredMoney = money.refine((v) => v !== null && v > 0, "Required");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date");
const httpsUrl = z.union([z.literal(""), z.string().trim().url().startsWith("https://", "Must start with https://")]);
const checkbox = z.preprocess((v) => v === "on" || v === true, z.boolean());
export const unitSchema = z.enum(["pcs", "boxes", "packs", "sets", "kg"]);
export const deliveryTermsSchema = z.enum(["supplier_delivery", "buyer_pickup", "third_party_freight"]);
export const birInvoiceSchema = z.enum(["vat", "non_vat", "none"]);
export const MAX_PRICE_TIERS = 5;

/** A repeated form field: absent -> [], one value -> [value], many -> as is. */
const list = z.preprocess((v) => (v == null ? [] : Array.isArray(v) ? v : [v]), z.array(z.string()));

export const loginEmailSchema = z.object({
  email: z.string().trim().email("Enter a valid email"),
  name: optionalText(100),
  role: z.enum(["buyer", "supplier"]),
});
export const loginCodeSchema = z.object({ code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code") });
export const loginVerifySchema = loginCodeSchema.extend({ email: z.string().trim().email() });
export const mfaVerifySchema = loginCodeSchema.extend({ factorId: z.string().uuid() });

// ---- Stage 1 backend inputs (shared by forms and Server Actions)

export const SUPPLIER_DOCUMENT_KINDS = {
  dti_sec: "DTI or SEC registration",
  bir: "BIR certificate (Form 2303)",
  mayors_permit: "Mayor's or business permit",
  valid_id: "Owner's valid ID",
  other: "Other supporting document",
} as const;
export const supplierDocumentSchema = z.object({
  kind: z.enum(Object.keys(SUPPLIER_DOCUMENT_KINDS) as [keyof typeof SUPPLIER_DOCUMENT_KINDS, ...(keyof typeof SUPPLIER_DOCUMENT_KINDS)[]]),
  storagePath: z.string().regex(/^[0-9a-f-]{36}\/[A-Za-z0-9._-]{1,200}$/, "Invalid file path"),
  fileName: text(200),
});
export const SUPPLIER_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;
export const SUPPLIER_DOCUMENT_TYPES = ["application/pdf", "image/jpeg", "image/png"] as const;

/** Statuses an admin can move a supplier to; the database decides which moves are allowed. */
export const supplierStatusSchema = z.object({
  supplierId: z.string().uuid(),
  status: z.enum(["under_review", "verified", "rejected", "suspended", "restricted"]),
  reason: optionalText(500),
});

export const settingSchema = z.object({
  key: z.string().regex(/^[a-z0-9_]+$/),
  value: z.string().trim().max(200),
});

/** Percent text ("1.5") -> integer basis points (150), no floats. */
const percentToBps = z
  .string()
  .trim()
  .regex(/^\d{1,3}(\.\d{1,2})?$/, "Use a percent like 1.5")
  .transform((v) => {
    const [whole, frac = ""] = v.split(".");
    return Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  })
  .refine((bps) => bps <= 10_000, "100% at most");
export const commissionScheduleSchema = z.object({
  ratePercent: percentToBps,
  startsOn: isoDate,
  categorySlug: z.string().default(""),
  note: optionalText(300),
});

export const accountSchema = z.object({
  name: text(100),
  phone: z.union([z.literal(""), z.string().regex(/^09\d{9}$/, "Use 09XXXXXXXXX")]),
  businessName: optionalText(150),
  industry: optionalText(150),
  city: optionalText(150),
  province: optionalText(150),
  website: httpsUrl,
  about: optionalText(900),
});

/** Generated once per form (crypto.randomUUID on the server page) so a double submit creates one record. */
const idempotencyKey = z.string().uuid().optional();

export const rfqSchema = z.object({
  idempotencyKey,
  product: text(160),
  categorySlug: text(60),
  description: text(2500),
  specs: text(1800),
  quantity: int(1),
  unit: unitSchema,
  city: text(100),
  province: text(100),
  requiredBy: isoDate,
  budget: money,
  deliveryPreference: z.union([deliveryTermsSchema, z.literal("any")]),
  needsBirInvoice: checkbox,
  sharingConsent: checkbox.refine((v) => v, "Consent is required to submit"),
});
/** Blank form field -> undefined, so drafts can leave it empty. */
const blankable = <S extends z.ZodType>(s: S) => z.preprocess((v) => (v === "" ? undefined : v), s.optional());

/** Drafts only need a product name; every other field may be blank or incomplete (checked on submit). */
export const rfqDraftSchema = z.object({
  idempotencyKey,
  product: text(160),
  categorySlug: blankable(z.string().trim().max(60)),
  description: optionalText(2500),
  specs: optionalText(1800),
  quantity: optionalInt(1),
  unit: unitSchema.default("pcs"),
  city: optionalText(100),
  province: optionalText(100),
  requiredBy: blankable(isoDate),
  budget: money,
  deliveryPreference: z.union([deliveryTermsSchema, z.literal("any")]).default("any"),
  needsBirInvoice: checkbox,
  sharingConsent: checkbox,
});

/** Parallel tier rows -> sorted tiers, each starting above `aboveQty`. Blank rows are dropped. */
function parseTiers(minList: string[], priceList: string[], aboveQty: number, ctx: z.RefinementCtx) {
  const priceTiers: { minQty: number; unitPriceCentavos: number }[] = [];
  const rows = Math.max(minList.length, priceList.length);
  for (let i = 0; i < rows; i++) {
    const minRaw = (minList[i] ?? "").trim();
    const priceRaw = (priceList[i] ?? "").trim();
    if (minRaw === "" && priceRaw === "") continue;
    const minQty = int(aboveQty + 1).safeParse(minRaw);
    if (!minQty.success) {
      ctx.addIssue({ code: "custom", path: ["tierMinQty"], message: `Row ${i + 1}: minimum quantity must be a whole number above ${aboveQty}` });
      continue;
    }
    const price = requiredMoney.safeParse(priceRaw);
    if (!price.success || price.data === null) {
      ctx.addIssue({ code: "custom", path: ["tierUnitPrice"], message: `Row ${i + 1}: enter a unit price` });
      continue;
    }
    priceTiers.push({ minQty: minQty.data, unitPriceCentavos: price.data });
  }
  if (priceTiers.length > MAX_PRICE_TIERS) {
    ctx.addIssue({ code: "custom", path: ["tierMinQty"], message: `At most ${MAX_PRICE_TIERS} price tiers` });
  }
  priceTiers.sort((a, b) => a.minQty - b.minQty);
  if (new Set(priceTiers.map((t) => t.minQty)).size !== priceTiers.length) {
    ctx.addIssue({ code: "custom", path: ["tierMinQty"], message: "Each tier needs a different minimum quantity" });
  }
  return priceTiers;
}

export const quoteSchema = z.object({
  idempotencyKey,
  quantity: int(1),
  unitPrice: requiredMoney,
  setupFee: money,
  shippingFee: money,
  tax: money,
  leadDays: int(1, 365),
  validUntil: isoDate,
  paymentTerms: text(300),
  notes: optionalText(1200),
  deliveryTerms: deliveryTermsSchema,
  birInvoice: birInvoiceSchema,
  // Parallel repeated fields, one pair per tier row; blank rows are dropped.
  tierMinQty: list,
  tierUnitPrice: list,
})
  .transform((q, ctx) => {
    const priceTiers = parseTiers(q.tierMinQty, q.tierUnitPrice, q.quantity, ctx);
    return {
      idempotencyKey: q.idempotencyKey,
      quantity: q.quantity, unitPrice: q.unitPrice, setupFee: q.setupFee, shippingFee: q.shippingFee, tax: q.tax,
      leadDays: q.leadDays, validUntil: q.validUntil, paymentTerms: q.paymentTerms, notes: q.notes,
      deliveryTerms: q.deliveryTerms, birInvoice: q.birInvoice, priceTiers,
    };
  });

export const counterOfferSchema = z.object({
  idempotencyKey,
  quantity: int(1),
  unitPrice: requiredMoney,
  leadDays: int(1, 365),
  paymentTerms: text(300),
  message: optionalText(1000),
});

export const selectSupplierSchema = z.object({
  acceptedOfferId: z.string().default(""),
  ack: checkbox.refine((v) => v, "Please confirm"),
});

export const messageSchema = z.object({ body: text(2000) });

/**
 * Create or edit a listing. `idempotencyKey` is generated once per new-product form (crypto.randomUUID()),
 * so a double submit creates one draft. Images upload separately to the product-media bucket.
 */
export const productSchema = z
  .object({
    idempotencyKey: z.string().uuid().optional(),
    title: text(140),
    categorySlug: text(60),
    description: text(1500),
    moq: int(1),
    unit: unitSchema,
    indicativePrice: money,
    leadDays: optionalInt(1, 365),
    returnClass: z.enum(["standard", "custom", "final_sale"]),
    listingType: z.enum(["product", "service"]).default("product"),
    tierMinQty: list,
    tierUnitPrice: list,
  })
  .transform((p, ctx) => {
    const priceTiers = parseTiers(p.tierMinQty, p.tierUnitPrice, p.moq, ctx);
    return {
      idempotencyKey: p.idempotencyKey, title: p.title, categorySlug: p.categorySlug, description: p.description,
      moq: p.moq, unit: p.unit, indicativePrice: p.indicativePrice, leadDays: p.leadDays,
      returnClass: p.returnClass, listingType: p.listingType, priceTiers,
    };
  });

/** Admin decision on a pending listing; the database requires a reason to reject. */
export const productReviewSchema = z.object({
  productId: z.string().uuid(),
  status: z.enum(["approved", "rejected"]),
  reason: optionalText(500),
});

/** A file the browser already uploaded to product-media/<supplierId>/<productId>/<file>. */
export const productMediaSchema = z.object({
  productId: z.string().uuid(),
  storagePath: z.string().regex(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[A-Za-z0-9._-]{1,200}$/, "Invalid file path"),
});
export const PRODUCT_MEDIA_MAX_BYTES = 5 * 1024 * 1024;
export const PRODUCT_MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export const promotionSchema = z.object({
  eyebrow: text(65),
  ctaLabel: text(40),
  headline: text(100),
  subheading: text(240),
  categorySlug: z.string().default(""),
  theme: z.enum(["red", "rose", "amber", "slate"]),
  imageUrl: httpsUrl,
  sortOrder: z.coerce.number().int(),
  status: z.enum(["active", "paused"]),
});

export const supplierProfileSchema = z.object({
  businessName: text(150),
  legalName: text(150),
  categorySlug: text(60),
  city: text(100),
  province: text(100),
  moq: int(1),
  leadDays: int(1, 365),
  description: text(1600),
});

export const discoverySchema = z.object({
  autoInvites: checkbox,
  deliveryAreas: text(1000),
  keywords: optionalText(300),
  maxQuantity: optionalInt(1),
});

export const assignSuppliersSchema = z.object({
  supplierIds: z.array(z.string()).min(1, "Pick at least one supplier").max(10, "Up to 10 suppliers"),
});

// Contact and Data Privacy Act requests (RA 10173 data subject rights).
export const CONTACT_TOPICS = {
  general: "General question",
  order: "Order, return or refund",
  supplier: "Becoming a supplier",
  privacy_access: "Privacy: access or copy of my data",
  privacy_correction: "Privacy: correct my data",
  privacy_erasure: "Privacy: delete or block my data",
  privacy_objection: "Privacy: object to processing / withdraw consent",
  privacy_portability: "Privacy: data portability",
  privacy_complaint: "Privacy: concern or complaint",
} as const;
export const contactSchema = z.object({
  topic: z.enum(Object.keys(CONTACT_TOPICS) as [keyof typeof CONTACT_TOPICS, ...(keyof typeof CONTACT_TOPICS)[]]),
  name: text(100),
  email: z.string().trim().email("Enter a valid email"),
  reference: optionalText(60),
  message: text(2000),
  privacyAck: checkbox.refine((v) => v, "Please confirm you have read the privacy notice"),
});
