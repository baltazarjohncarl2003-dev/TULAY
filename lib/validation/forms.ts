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

export const rfqSchema = z.object({
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
  sharingConsent: checkbox.refine((v) => v, "Consent is required to submit"),
});
/** Drafts only need a product name (legacy saved partial drafts). */
export const rfqDraftSchema = z.object({ product: text(160) }).passthrough();

export const quoteSchema = z.object({
  quantity: int(1),
  unitPrice: requiredMoney,
  setupFee: money,
  shippingFee: money,
  tax: money,
  leadDays: int(1, 365),
  validUntil: isoDate,
  paymentTerms: text(300),
  notes: optionalText(1200),
});

export const counterOfferSchema = z.object({
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

export const productSchema = z.object({
  title: text(140),
  categorySlug: text(60),
  description: text(1500),
  moq: int(1),
  unit: unitSchema,
  indicativePrice: money,
  leadDays: optionalInt(1, 365),
  imageUrl: httpsUrl,
  returnClass: z.enum(["standard", "custom", "final_sale"]),
});

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
