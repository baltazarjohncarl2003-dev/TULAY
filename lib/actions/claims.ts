"use server";

import { z } from "zod";
import { type ActionResult, dbError, parseInput } from "@/lib/action-result";
import { toCentavos } from "@/lib/format";
import { settleRefund } from "@/lib/refunds";
import { createClient } from "@/lib/supabase/server";

// Claims and reviews. The database enforces windows, evidence, item rules, who may act, the refund cap and
// the restocking fee; these actions validate input and, when a step creates an online refund, settle it
// through the gateway right away.

type Fail = Exclude<ActionResult, { ok: true }>;
const uuid = z.string().uuid();
const notFound: Fail = { ok: false, error: "Not found" };

const pesos = z.string().transform((v, ctx) => {
  try {
    const c = toCentavos(v);
    if (c === null || c <= 0) throw new Error("Enter an amount");
    return c;
  } catch (e) {
    ctx.addIssue({ code: "custom", message: (e as Error).message });
    return z.NEVER;
  }
});

/** After a step that may have created an online refund: send it to the gateway. */
async function settleIfRefund(claimId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("claims")
    .select("online_refund_id, refunds!claims_online_refund_id_fkey(status)")
    .eq("id", claimId)
    .maybeSingle();
  if (data?.online_refund_id && data.refunds?.status === "pending") return settleRefund(data.online_refund_id);
  return { ok: true };
}

// ---------------------------------------------------------------- buyer

const openSchema = z.object({
  claimId: uuid,
  orderId: uuid,
  type: z.enum(["damage", "return", "defect"]),
  itemIds: z.array(uuid).max(100).default([]),
  description: z.string().trim().min(10, "Describe the problem (10+ characters)").max(2000),
  evidence: z
    .array(z.object({ path: z.string().max(400), fileName: z.string().trim().min(1).max(200) }))
    .min(1, "Add at least one photo or video")
    .max(10),
});

/**
 * Opens a claim. Upload evidence first to order-files/<orderId>/claims/<claimId>/<file>
 * with a claimId made once in the browser (crypto.randomUUID()); a retry with it returns the same claim.
 */
export async function openClaim(raw: Record<string, unknown>): Promise<ActionResult> {
  const input = parseInput(openSchema, raw);
  if (!input.ok) return input;
  const d = input.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("open_claim", {
    p_claim_id: d.claimId,
    p_order_id: d.orderId,
    p_type: d.type,
    p_item_ids: d.itemIds,
    p_description: d.description,
    p_evidence: d.evidence,
  });
  return error ? dbError(error) : { ok: true };
}

export async function escalateClaim(claimId: string, note = ""): Promise<ActionResult> {
  if (!uuid.safeParse(claimId).success) return notFound;
  const supabase = await createClient();
  const { error } = await supabase.rpc("escalate_claim", { p_claim_id: claimId, p_note: String(note).slice(0, 1000) });
  return error ? dbError(error) : { ok: true };
}

export async function cancelClaim(claimId: string): Promise<ActionResult> {
  if (!uuid.safeParse(claimId).success) return notFound;
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_claim", { p_claim_id: claimId });
  return error ? dbError(error) : { ok: true };
}

/** Whoever pays the return (buyer for change of mind, else supplier) records its tracking reference. */
export async function recordReturnShipment(claimId: string, trackingRef: string): Promise<ActionResult> {
  if (!uuid.safeParse(claimId).success) return notFound;
  const ref = String(trackingRef).trim();
  if (ref.length < 3 || ref.length > 100) return { ok: false, error: "Enter the courier tracking reference" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("record_return_shipment", { p_claim_id: claimId, p_tracking_ref: ref });
  return error ? dbError(error) : { ok: true };
}

// ---------------------------------------------------------------- supplier

const respondSchema = z.discriminatedUnion("accept", [
  z.object({ accept: z.literal(false), note: z.string().trim().min(3, "Give the buyer a reason").max(1000) }),
  z.object({
    accept: z.literal(true),
    remedy: z.enum(["refund", "replacement"]),
    refund: z.string().default(""),
    returnRequired: z.boolean().default(false),
    note: z.string().trim().max(1000).default(""),
  }),
]);

/** Supplier: accept (refund amount in pesos, or replacement; optional return) or reject with a reason. */
export async function respondClaim(claimId: string, raw: Record<string, unknown>): Promise<ActionResult> {
  if (!uuid.safeParse(claimId).success) return notFound;
  const input = parseInput(respondSchema, raw);
  if (!input.ok) return input;
  const d = input.data;
  let refund: number | null = null;
  if (d.accept && d.remedy === "refund") {
    const r = pesos.safeParse(d.refund);
    if (!r.success) return { ok: false, error: r.error.issues[0]?.message ?? "Enter an amount" };
    refund = r.data;
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("respond_claim", {
    p_claim_id: claimId,
    p_accept: d.accept,
    p_remedy: (d.accept ? d.remedy : null) as "refund",
    p_refund_centavos: refund as number,
    p_return_required: d.accept ? d.returnRequired : false,
    p_note: d.note,
  });
  if (error) return dbError(error);
  return settleIfRefund(claimId);
}

export async function confirmReturnReceived(claimId: string): Promise<ActionResult> {
  if (!uuid.safeParse(claimId).success) return notFound;
  const supabase = await createClient();
  const { error } = await supabase.rpc("confirm_return_received", { p_claim_id: claimId });
  if (error) return dbError(error);
  return settleIfRefund(claimId);
}

/** Supplier: the cash-on-delivery part was paid back directly (GCash / bank transfer reference). */
export async function recordManualRefund(claimId: string, reference: string): Promise<ActionResult> {
  if (!uuid.safeParse(claimId).success) return notFound;
  const supabase = await createClient();
  const { error } = await supabase.rpc("record_manual_refund", { p_claim_id: claimId, p_reference: String(reference).slice(0, 200) });
  return error ? dbError(error) : { ok: true };
}

export async function markReplacementSent(claimId: string, note = ""): Promise<ActionResult> {
  if (!uuid.safeParse(claimId).success) return notFound;
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_replacement_sent", { p_claim_id: claimId, p_note: String(note).slice(0, 500) });
  return error ? dbError(error) : { ok: true };
}

/** Supplier: restocking fee on change-of-mind returns, as a percent ("2.5"); the platform cap applies. */
export async function setRestockingFee(percent: string): Promise<ActionResult> {
  const m = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(String(percent).trim());
  const bps = m ? Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0")) : NaN;
  if (!Number.isInteger(bps) || bps < 0 || bps > 10000) return { ok: false, error: "Use a percent like 2.5" };
  const supabase = await createClient();
  const { data: user } = await supabase.auth.getUser();
  const { data, error } = await supabase.from("suppliers").update({ restocking_fee_bps: bps }).eq("owner_id", user.user?.id ?? "").select("id");
  if (error) return dbError(error);
  return data.length ? { ok: true } : { ok: false, error: "Apply as a supplier first." };
}

// ---------------------------------------------------------------- both sides + support

export async function addClaimMessage(claimId: string, body: string): Promise<ActionResult> {
  if (!uuid.safeParse(claimId).success) return notFound;
  const text = String(body).trim();
  if (!text || text.length > 2000) return { ok: false, error: "Messages are 1 to 2000 characters" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("add_claim_message", { p_claim_id: claimId, p_body: text });
  return error ? dbError(error) : { ok: true };
}

const decideSchema = z.object({
  outcome: z.enum(["refund", "replacement", "decline"]),
  refund: z.string().default(""),
  returnRequired: z.boolean().default(false),
  note: z.string().trim().min(3, "Explain the decision").max(1000),
});

/** Support: decide an escalated claim (refund / replacement, optionally with a return) or decline it (final). */
export async function adminDecideClaim(claimId: string, raw: Record<string, unknown>): Promise<ActionResult> {
  if (!uuid.safeParse(claimId).success) return notFound;
  const input = parseInput(decideSchema, raw);
  if (!input.ok) return input;
  const d = input.data;
  let refund: number | null = null;
  if (d.outcome === "refund") {
    const r = pesos.safeParse(d.refund);
    if (!r.success) return { ok: false, error: r.error.issues[0]?.message ?? "Enter an amount" };
    refund = r.data;
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_decide_claim", {
    p_claim_id: claimId,
    p_outcome: d.outcome,
    p_refund_centavos: refund as number,
    p_return_required: d.returnRequired,
    p_note: d.note,
  });
  if (error) return dbError(error);
  return settleIfRefund(claimId);
}

// ---------------------------------------------------------------- reviews

const reviewSchema = z.object({
  orderId: uuid,
  rating: z.coerce.number().int().min(1, "Pick 1 to 5 stars").max(5),
  body: z.string().trim().max(2000).default(""),
});

export async function postReview(raw: Record<string, unknown>): Promise<ActionResult> {
  const input = parseInput(reviewSchema, raw);
  if (!input.ok) return input;
  const supabase = await createClient();
  const { error } = await supabase.rpc("post_review", { p_order_id: input.data.orderId, p_rating: input.data.rating, p_body: input.data.body });
  return error ? dbError(error) : { ok: true };
}

export async function replyReview(reviewId: string, reply: string): Promise<ActionResult> {
  if (!uuid.safeParse(reviewId).success) return notFound;
  const supabase = await createClient();
  const { error } = await supabase.rpc("reply_review", { p_review_id: reviewId, p_reply: String(reply).slice(0, 1000) });
  return error ? dbError(error) : { ok: true };
}

export async function adminHideReview(reviewId: string, hidden: boolean, reason = ""): Promise<ActionResult> {
  if (!uuid.safeParse(reviewId).success) return notFound;
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_hide_review", { p_review_id: reviewId, p_hidden: hidden === true, p_reason: String(reason).slice(0, 500) });
  return error ? dbError(error) : { ok: true };
}
