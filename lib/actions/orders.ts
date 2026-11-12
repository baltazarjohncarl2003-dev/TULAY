"use server";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { type ActionResult, dbError, parseInput } from "@/lib/action-result";
import { toCentavos } from "@/lib/format";
import { getPaymentProvider, type PaymentMethod } from "@/lib/payments";
import { signFakeEvent } from "@/lib/payments/fake";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { MAX_QUANTITY } from "@/lib/validation/forms";

// Cart, checkout, cancellation, refunds and payouts. The database prices, reserves stock, checks
// roles and writes the ledger; these actions validate input and talk to the payment adapter.

type Fail = Exclude<ActionResult, { ok: true }>;
const uuid = z.string().uuid();
const method = z.enum(["card", "ewallet", "online_banking"]);
const qty = z.coerce.number().int("Whole number").min(1).max(MAX_QUANTITY);

// ---------------------------------------------------------------- cart

const cartSchema = z.object({ productId: uuid, variantId: z.union([uuid, z.literal("")]).default(""), quantity: qty });

/** Adds a listing (or sets its quantity when it is already in the cart). MOQ and stock are checked at checkout. */
export async function addToCart(raw: Record<string, unknown>): Promise<ActionResult> {
  const input = parseInput(cartSchema, raw);
  if (!input.ok) return input;
  const { productId, variantId, quantity } = input.data;
  const supabase = await createClient();
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return { ok: false, error: "Sign in to add items to your cart." };
  const { error } = await supabase
    .from("cart_items")
    .upsert(
      { user_id: user.user.id, product_id: productId, variant_id: variantId || null, quantity },
      { onConflict: "user_id,product_id,variant_id" },
    );
  return error ? dbError(error) : { ok: true };
}

export async function updateCartItem(id: string, quantity: number): Promise<ActionResult> {
  const q = qty.safeParse(quantity);
  if (!uuid.safeParse(id).success || !q.success) return { ok: false, error: "Enter a whole quantity" };
  const supabase = await createClient();
  const { error } = await supabase.from("cart_items").update({ quantity: q.data }).eq("id", id);
  return error ? dbError(error) : { ok: true };
}

export async function removeCartItem(id: string): Promise<ActionResult> {
  if (!uuid.safeParse(id).success) return { ok: false, error: "Not found" };
  const supabase = await createClient();
  const { error } = await supabase.from("cart_items").delete().eq("id", id);
  return error ? dbError(error) : { ok: true };
}

// ---------------------------------------------------------------- checkout

const checkoutSchema = z.object({
  method,
  idempotencyKey: uuid,
  /** "" only for buyer pickup on RFQ deals; the database says when an address is required. */
  addressId: z.union([uuid, z.literal("")]).default(""),
  paymentOption: z.enum(["online", "cod"]).default("online"),
});

/** Opens (or reopens) the gateway session for a checkout the database created. */
async function sendToGateway(checkoutId: string, amountCentavos: number, pm: PaymentMethod): Promise<{ ok: true; redirectUrl: string } | Fail> {
  const supabase = await createClient();
  const provider = getPaymentProvider();
  const { data: pay } = await supabase.from("payments").select("provider_ref, status").eq("checkout_id", checkoutId).maybeSingle();
  if (pay?.status !== "pending") return { ok: false, error: "This checkout is closed. Please start again." };
  if (pay.provider_ref) return { ok: true, redirectUrl: provider.resumeUrl(pay.provider_ref) }; // retry of the same submit
  const session = await provider.createSession({ checkoutId, amountCentavos, method: pm, description: "TULAY order" });
  const { error } = await supabase.rpc("attach_payment_session", {
    p_checkout_id: checkoutId,
    p_provider: provider.name,
    p_provider_ref: session.providerRef,
  });
  return error ? (dbError(error) as Fail) : { ok: true, redirectUrl: session.redirectUrl };
}

/** Checks out the whole cart in one payment. Returns where to send the buyer to pay. */
export async function startCheckout(raw: Record<string, unknown>): Promise<{ ok: true; redirectUrl: string } | Fail> {
  const input = parseInput(checkoutSchema, raw);
  if (!input.ok) return input;
  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("start_checkout", {
      p_idempotency_key: input.data.idempotencyKey,
      p_method: input.data.method,
      p_address_id: (input.data.addressId || null) as string,
      p_payment_option: input.data.paymentOption,
    })
    .single();
  if (error) return dbError(error) as Fail;
  // COD with nothing due online is already confirmed.
  if (data.amount_centavos === 0) return { ok: true, redirectUrl: "/buyer/orders" };
  return sendToGateway(data.checkout_id, data.amount_centavos, input.data.method);
}

/** Pays for a selected RFQ deal at its recorded amount. */
export async function startDealCheckout(selectionId: string, raw: Record<string, unknown>): Promise<{ ok: true; redirectUrl: string } | Fail> {
  if (!uuid.safeParse(selectionId).success) return { ok: false, error: "Not found" };
  const input = parseInput(checkoutSchema, raw);
  if (!input.ok) return input;
  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("start_selection_checkout", {
      p_selection_id: selectionId,
      p_idempotency_key: input.data.idempotencyKey,
      p_method: input.data.method,
      p_address_id: (input.data.addressId || null) as string, // null = buyer pickup
    })
    .single();
  if (error) return dbError(error) as Fail;
  return sendToGateway(data.checkout_id, data.amount_centavos, input.data.method);
}

/**
 * Fake gateway only: the buyer's "Pay" / "Fail" button on /pay/fake/<ref>. Sends a signed webhook to our
 * own route, exactly like the real gateway would, so the normal confirmation path runs.
 */
export async function simulateFakePayment(providerRef: string, outcome: "paid" | "failed"): Promise<ActionResult> {
  const provider = getPaymentProvider();
  if (provider.name !== "fake") return { ok: false, error: "Not available" };
  const supabase = await createClient();
  const { data: pay } = await supabase.from("payments").select("amount_centavos, status").eq("provider_ref", providerRef).maybeSingle();
  if (!pay) return { ok: false, error: "Payment not found" };
  if (pay.status !== "pending") return { ok: false, error: "This payment is already closed." };
  const { body, headers } = signFakeEvent({
    id: `evt_${randomUUID()}`,
    type: outcome === "paid" ? "payment.paid" : "payment.failed",
    providerRef,
    amountCentavos: pay.amount_centavos,
    feeCentavos: null,
  });
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://127.0.0.1:3000";
  const res = await fetch(`${site}/api/webhooks/payments`, { method: "POST", headers, body });
  if (!res.ok) return { ok: false, error: "The payment could not be recorded. Try again." };
  return { ok: true };
}

// ---------------------------------------------------------------- refunds

/** Sends a pending refund to the gateway, then settles it in the database (service role). */
async function settleRefund(refundId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: rf } = await supabase
    .from("refunds")
    .select("amount_centavos, reason, payments(provider_ref)")
    .eq("id", refundId)
    .maybeSingle();
  const providerRef = rf?.payments?.provider_ref;
  if (!rf || !providerRef) return { ok: false, error: "Refund recorded; TULAY finance will complete it." };
  const admin = createAdminClient();
  try {
    const done = await getPaymentProvider().refund({ providerRef, amountCentavos: rf.amount_centavos, reason: rf.reason });
    const { error } = await admin.rpc("complete_refund", { p_refund_id: refundId, p_provider_refund_ref: done.providerRefundRef, p_success: true });
    return error ? dbError(error) : { ok: true };
  } catch {
    await admin.rpc("complete_refund", { p_refund_id: refundId, p_provider_refund_ref: null as unknown as string, p_success: false });
    return { ok: false, error: "The gateway refused the refund. TULAY finance has been notified." };
  }
}

/** Buyer: cancel a paid order before production (full refund). */
export async function cancelOrder(orderId: string, reason = ""): Promise<ActionResult> {
  if (!uuid.safeParse(orderId).success) return { ok: false, error: "Not found" };
  const supabase = await createClient();
  const { data: refundId, error } = await supabase.rpc("cancel_order", { p_order_id: orderId, p_reason: String(reason).slice(0, 500) });
  if (error) return dbError(error);
  return refundId ? settleRefund(refundId) : { ok: true };
}

const refundSchema = z.object({
  orderId: uuid,
  amount: z.string().transform((v, ctx) => {
    try {
      const c = toCentavos(v);
      if (c === null || c <= 0) throw new Error("Enter an amount");
      return c;
    } catch (e) {
      ctx.addIssue({ code: "custom", message: (e as Error).message });
      return z.NEVER;
    }
  }),
  reason: z.string().trim().min(3, "Give a reason").max(500),
  idempotencyKey: uuid,
});

/** Finance: refund part or all of an order (capped by the database at what is still refundable). */
export async function adminRefund(raw: Record<string, unknown>): Promise<ActionResult> {
  const input = parseInput(refundSchema, raw);
  if (!input.ok) return input;
  const supabase = await createClient();
  const { data: refundId, error } = await supabase.rpc("admin_create_refund", {
    p_order_id: input.data.orderId,
    p_amount_centavos: input.data.amount,
    p_reason: input.data.reason,
    p_idempotency_key: input.data.idempotencyKey,
  });
  if (error) return dbError(error);
  return settleRefund(refundId);
}

/** Finance: refund a payment that matched no open checkout. */
export async function adminRefundUnmatched(paymentId: string, idempotencyKey: string): Promise<ActionResult> {
  if (!uuid.safeParse(paymentId).success || !uuid.safeParse(idempotencyKey).success) return { ok: false, error: "Not found" };
  const supabase = await createClient();
  const { data: refundId, error } = await supabase.rpc("admin_refund_unmatched", { p_payment_id: paymentId, p_idempotency_key: idempotencyKey });
  if (error) return dbError(error);
  return settleRefund(refundId);
}

/** Finance: record a scheduled payout as sent. */
export async function releasePayout(payoutId: string, providerRef: string): Promise<ActionResult> {
  if (!uuid.safeParse(payoutId).success) return { ok: false, error: "Not found" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_release_payout", { p_payout_id: payoutId, p_provider_ref: String(providerRef).slice(0, 200) });
  return error ? dbError(error) : { ok: true };
}

// ---------------------------------------------------------------- supplier: options and stock

const variantsSchema = z
  .array(
    z.object({
      name: z.string().trim().min(1).max(80),
      priceDelta: z.string().default(""), // pesos text, may be negative ("-5.00")
    }),
  )
  .max(50);

/** Replaces a listing's options. Changing an approved listing's options re-opens TULAY review. */
export async function setVariants(productId: string, rows: unknown): Promise<ActionResult> {
  if (!uuid.safeParse(productId).success) return { ok: false, error: "Not found" };
  const input = parseInput(variantsSchema, rows);
  if (!input.ok) return input;
  const variants: { name: string; priceDeltaCentavos: number }[] = [];
  for (const r of input.data) {
    const negative = r.priceDelta.trim().startsWith("-");
    try {
      const c = toCentavos(r.priceDelta.trim().replace(/^-/, "")) ?? 0;
      variants.push({ name: r.name, priceDeltaCentavos: negative ? -c : c });
    } catch (e) {
      return { ok: false, error: `${r.name}: ${(e as Error).message}` };
    }
  }
  if (new Set(variants.map((v) => v.name.toLowerCase())).size !== variants.length) return { ok: false, error: "Option names must be different" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_product_variants", { p_product_id: productId, p_variants: variants });
  return error ? dbError(error) : { ok: true };
}

/** Sets units on hand for a listing or one option; blank = stop tracking (made to order). */
export async function setStock(productId: string, variantId: string | null, stock: string): Promise<ActionResult> {
  if (!uuid.safeParse(productId).success || (variantId !== null && !uuid.safeParse(variantId).success)) return { ok: false, error: "Not found" };
  const s = stock.trim() === "" ? null : z.coerce.number().int().min(0).max(MAX_QUANTITY).safeParse(stock);
  if (s !== null && !s.success) return { ok: false, error: "Stock is a whole number of 0 or more" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_stock", {
    p_product_id: productId,
    p_variant_id: variantId as string, // null = the listing itself
    p_stock: (s === null ? null : s.data) as number,
  });
  return error ? dbError(error) : { ok: true };
}
