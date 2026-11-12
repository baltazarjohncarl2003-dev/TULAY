"use server";

import { z } from "zod";
import { type ActionResult, dbError, parseInput } from "@/lib/action-result";
import { createClient } from "@/lib/supabase/server";
import {
  assignSuppliersSchema,
  counterOfferSchema,
  discoverySchema,
  messageSchema,
  quoteSchema,
  rfqDraftSchema,
  rfqSchema,
  selectSupplierSchema,
} from "@/lib/validation/forms";

// RFQ workflow. The database decides who may act and which status moves are allowed
// (see supabase/migrations/*_deals.sql); these actions validate input and pass it on.

type Fail = Exclude<ActionResult, { ok: true }>;
const uuid = z.string().uuid();
const notFound: Fail = { ok: false, error: "Not found" };

/**
 * Saves a request. `submit` = false keeps it a draft (only the product name is required);
 * true checks every field and sends it to TULAY review. New requests need `idempotencyKey`.
 */
export async function saveRfq(
  rfqId: string | null,
  raw: Record<string, unknown>,
  submit: boolean,
): Promise<{ ok: true; id: string } | Fail> {
  if (rfqId !== null && !uuid.safeParse(rfqId).success) return notFound;
  const input = submit ? parseInput(rfqSchema, raw) : parseInput(rfqDraftSchema, raw);
  if (!input.ok) return input;
  const d = input.data;
  if (rfqId === null && !d.idempotencyKey) return { ok: false, error: "Please reload the form and try again." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_rfq", {
    p_rfq_id: rfqId as string, // null creates; the generated types do not mark it nullable
    p_idempotency_key: (d.idempotencyKey ?? null) as string, // undefined would drop the argument and miss the function
    p_product: d.product,
    p_category_slug: d.categorySlug ?? "",
    p_description: d.description,
    p_specs: d.specs,
    p_quantity: d.quantity as number,
    p_unit: d.unit,
    p_city: d.city,
    p_province: d.province,
    p_required_by: (d.requiredBy ?? null) as string,
    p_budget_centavos: d.budget as number,
    p_sharing_consent: d.sharingConsent,
    p_delivery_preference: d.deliveryPreference,
    p_needs_bir_invoice: d.needsBirInvoice,
    p_submit: submit,
  });
  return error ? (dbError(error) as Fail) : { ok: true, id: data };
}

export async function cancelRfq(rfqId: string, reason = ""): Promise<ActionResult> {
  if (!uuid.safeParse(rfqId).success) return notFound;
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_rfq", { p_rfq_id: rfqId, p_reason: String(reason).slice(0, 500) });
  return error ? dbError(error) : { ok: true };
}

const reviewSchema = z.object({
  rfqId: uuid,
  decision: z.enum(["approve", "needs_information", "reject"]),
  note: z.string().trim().max(500).optional().default(""),
});

/** Admin (support): approve (auto-invites opted-in matches), ask for information, or reject with a note. */
export async function reviewRfq(raw: Record<string, unknown>): Promise<ActionResult> {
  const input = parseInput(reviewSchema, raw);
  if (!input.ok) return input;
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_review_rfq", {
    p_rfq_id: input.data.rfqId,
    p_decision: input.data.decision,
    p_note: input.data.note,
  });
  return error ? dbError(error) : { ok: true };
}

/** Admin (support): invite suppliers; already-invited ones are skipped. */
export async function inviteSuppliers(rfqId: string, raw: Record<string, unknown>): Promise<ActionResult> {
  if (!uuid.safeParse(rfqId).success) return notFound;
  const input = parseInput(assignSuppliersSchema, raw);
  if (!input.ok) return input;
  if (!input.data.supplierIds.every((id) => uuid.safeParse(id).success)) return { ok: false, error: "Unknown supplier" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_invite_suppliers", { p_rfq_id: rfqId, p_supplier_ids: input.data.supplierIds });
  return error ? dbError(error) : { ok: true };
}

/** Supplier: accept or decline an invitation. */
export async function respondInvite(rfqId: string, accept: boolean): Promise<ActionResult> {
  if (!uuid.safeParse(rfqId).success) return notFound;
  const supabase = await createClient();
  const { error } = await supabase.rpc("respond_rfq_invite", { p_rfq_id: rfqId, p_accept: accept === true });
  return error ? dbError(error) : { ok: true };
}

/** Supplier: a new quote or revision. Needs `idempotencyKey`; a retry returns the same quote. */
export async function submitQuote(rfqId: string, raw: Record<string, unknown>): Promise<ActionResult> {
  if (!uuid.safeParse(rfqId).success) return notFound;
  const input = parseInput(quoteSchema, raw);
  if (!input.ok) return input;
  const q = input.data;
  if (!q.idempotencyKey) return { ok: false, error: "Please reload the form and try again." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_quote", {
    p_rfq_id: rfqId,
    p_idempotency_key: q.idempotencyKey,
    p_quantity: q.quantity,
    p_unit_price_centavos: q.unitPrice as number,
    // null = the supplier left the fee blank (not zero); the generated types do not mark these nullable.
    p_setup_fee_centavos: q.setupFee as number,
    p_shipping_fee_centavos: q.shippingFee as number,
    p_tax_centavos: q.tax as number,
    p_lead_days: q.leadDays,
    p_valid_until: q.validUntil,
    p_payment_terms: q.paymentTerms,
    p_notes: q.notes,
    p_delivery_terms: q.deliveryTerms,
    p_bir_invoice: q.birInvoice,
    p_price_tiers: q.priceTiers,
  });
  return error ? dbError(error) : { ok: true };
}

/** Either side: counteroffer on the supplier's latest quote. Needs `idempotencyKey`. */
export async function sendCounter(rfqId: string, supplierId: string, raw: Record<string, unknown>): Promise<ActionResult> {
  if (!uuid.safeParse(rfqId).success || !uuid.safeParse(supplierId).success) return notFound;
  const input = parseInput(counterOfferSchema, raw);
  if (!input.ok) return input;
  const c = input.data;
  if (!c.idempotencyKey) return { ok: false, error: "Please reload the form and try again." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("make_offer", {
    p_rfq_id: rfqId,
    p_supplier_id: supplierId,
    p_idempotency_key: c.idempotencyKey,
    p_action: "counter",
    p_related_offer_id: null as unknown as string, // the database links the open counter it answers
    p_quantity: c.quantity,
    p_unit_price_centavos: c.unitPrice as number,
    p_lead_days: c.leadDays,
    p_payment_terms: c.paymentTerms,
    p_message: c.message,
  });
  return error ? dbError(error) : { ok: true };
}

const answerSchema = z.object({
  rfqId: uuid,
  supplierId: uuid,
  offerId: uuid,
  accept: z.boolean(),
  idempotencyKey: uuid,
  message: z.string().trim().max(1000).optional().default(""),
});

/** Either side: accept or decline the other party's open counteroffer (its terms are copied). */
export async function answerCounter(raw: Record<string, unknown>): Promise<ActionResult> {
  const input = parseInput(answerSchema, raw);
  if (!input.ok) return input;
  const a = input.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("make_offer", {
    p_rfq_id: a.rfqId,
    p_supplier_id: a.supplierId,
    p_idempotency_key: a.idempotencyKey,
    p_action: a.accept ? "accept" : "decline",
    p_related_offer_id: a.offerId,
    p_quantity: null as unknown as number,
    p_unit_price_centavos: null as unknown as number,
    p_lead_days: null as unknown as number,
    p_payment_terms: null as unknown as string,
    p_message: a.message,
  });
  return error ? dbError(error) : { ok: true };
}

/** Buyer: record the deal on a supplier's latest valid quote (optionally on an accepted counteroffer). */
export async function selectSupplier(rfqId: string, quoteId: string, raw: Record<string, unknown>): Promise<ActionResult> {
  if (!uuid.safeParse(rfqId).success || !uuid.safeParse(quoteId).success) return notFound;
  const input = parseInput(selectSupplierSchema, raw);
  if (!input.ok) return input;
  const offerId = input.data.acceptedOfferId;
  if (offerId && !uuid.safeParse(offerId).success) return { ok: false, error: "Unknown counteroffer" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("select_supplier", {
    p_rfq_id: rfqId,
    p_quote_id: quoteId,
    p_offer_id: (offerId || null) as string,
  });
  return error ? dbError(error) : { ok: true };
}

/** Buyer or invited supplier: a message in the RFQ thread with that supplier. */
export async function sendRfqMessage(rfqId: string, supplierId: string, raw: Record<string, unknown>): Promise<ActionResult> {
  if (!uuid.safeParse(rfqId).success || !uuid.safeParse(supplierId).success) return notFound;
  const input = parseInput(messageSchema, raw);
  if (!input.ok) return input;
  const supabase = await createClient();
  const { error } = await supabase.rpc("send_rfq_message", { p_rfq_id: rfqId, p_supplier_id: supplierId, p_body: input.data.body });
  return error ? dbError(error) : { ok: true };
}

export async function markNotificationsRead(): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_notifications_read");
  return error ? dbError(error) : { ok: true };
}

/** Supplier: matching preferences (auto-invites, delivery areas, keywords, max quantity). RLS: own row only. */
export async function saveDiscovery(raw: Record<string, unknown>): Promise<ActionResult> {
  const input = parseInput(discoverySchema, raw);
  if (!input.ok) return input;
  const d = input.data;
  const areas = [...new Set(d.deliveryAreas.split(",").map((a) => a.trim()).filter(Boolean))];
  if (areas.length > 30 || areas.some((a) => a.length > 100)) return { ok: false, error: "Up to 30 areas, 100 characters each" };
  const supabase = await createClient();
  const { data: user } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("suppliers")
    .update({ auto_invites: d.autoInvites, delivery_areas: areas, keywords: d.keywords, max_quantity: d.maxQuantity })
    .eq("owner_id", user.user?.id ?? "")
    .select("id");
  if (error) return dbError(error);
  return data.length ? { ok: true } : { ok: false, error: "Apply as a supplier first." };
}
