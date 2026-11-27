"use server";

import { randomUUID } from "node:crypto";
import { updateTag } from "next/cache";
import { z } from "zod";
import { type ActionResult, dbError, parseInput } from "@/lib/action-result";
import { toCentavos } from "@/lib/format";
import { getPaymentProvider, type PaymentMethod } from "@/lib/payments";
import { signFakeEvent } from "@/lib/payments/fake";
import { retryPendingRefund, settleRefund } from "@/lib/refunds";
import { CATALOG_TAG } from "@/lib/data/catalog";
import { getCourier } from "@/lib/shipping";
import { toStop } from "@/lib/shipping/stops";
import { CourierError } from "@/lib/shipping/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { POST as paymentWebhook } from "@/app/api/webhooks/payments/route";
import { MAX_QUANTITY } from "@/lib/validation/forms";

// Cart, checkout, cancellation, refunds and payouts. The database prices, reserves stock, checks
// roles and writes the ledger; these actions validate input and talk to the payment adapter.

type Fail = Exclude<ActionResult, { ok: true }>;
const uuid = z.string().uuid();
const method = z.enum(["qrph", "card", "ewallet", "online_banking"]);
const qty = z.coerce.number().int("Whole number").min(1).max(MAX_QUANTITY);

// ---------------------------------------------------------------- cart

const cartSchema = z.object({ productId: uuid, variantId: z.union([uuid, z.literal("")]).default(""), quantity: qty });

/** `unauthenticated`: send the visitor to sign in. `existed`: the line was already in the cart, so its quantity was set, not added. */
export type AddToCartResult = ActionResult & { unauthenticated?: true; existed?: boolean };

/** Adds a listing (or sets its quantity when it is already in the cart). MOQ and stock are checked at checkout. */
export async function addToCart(raw: Record<string, unknown>): Promise<AddToCartResult> {
  const input = parseInput(cartSchema, raw);
  if (!input.ok) return input;
  const { productId, variantId, quantity } = input.data;
  const supabase = await createClient();
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return { ok: false, error: "Sign in to add items to your cart.", unauthenticated: true };
  const found = supabase.from("cart_items").select("id").eq("product_id", productId);
  const { data: before } = await (variantId ? found.eq("variant_id", variantId) : found.is("variant_id", null)).maybeSingle();
  const { error } = await supabase
    .from("cart_items")
    .upsert(
      { user_id: user.user.id, product_id: productId, variant_id: variantId || null, quantity },
      { onConflict: "user_id,product_id,variant_id" },
    );
  return error ? dbError(error) : { ok: true, existed: !!before };
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
  /** Saved live delivery quotes from quoteCartShipping; the database freezes the amounts. */
  quoteIds: z.array(uuid).max(50).default([]),
});

export type CartQuote = { quoteId: string; amountCentavos: number; expiresAt: string } | { error: string };

/**
 * Buyer: live courier price per supplier in the cart for one saved address. Each price is saved server side
 * (held for an admin-set time); the browser only gets the amount, expiry and id to send back at checkout.
 */
export async function quoteCartShipping(addressId: string): Promise<{ ok: true; quotes: Record<string, CartQuote> } | Fail> {
  if (!uuid.safeParse(addressId).success) return { ok: false, error: "Not found" };
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, error: "Sign in to continue." };
  const buyerId = auth.user.id;
  const { data: address } = await supabase
    .from("addresses")
    .select("id, lat, lng, line1, line2, barangay, city, province, postal_code")
    .eq("id", addressId)
    .maybeSingle();
  if (!address) return { ok: false, error: "Not found" };
  const courier = getCourier();
  if (!courier.quote) return { ok: true, quotes: {} };
  const quote = courier.quote.bind(courier);

  const { data: cart, error: cartError } = await supabase.from("cart_items").select("products(supplier_id)");
  if (cartError) return dbError(cartError) as Fail;
  // shortcut: at most 10 suppliers are quoted per call and the rest keep the zone fee; upgrade if carts span more.
  const supplierIds = [
    ...new Set(
      (cart ?? []).flatMap((r) => {
        const p = r.products as { supplier_id: string } | { supplier_id: string }[] | null;
        return (Array.isArray(p) ? p : p ? [p] : []).map((x) => x.supplier_id);
      }),
    ),
  ].slice(0, 10);

  const quotes: Record<string, CartQuote> = {};
  const unavailable = { error: "Live delivery price unavailable right now. The standard fee applies." };
  const dropoff = toStop(address);
  if (!dropoff) {
    for (const id of supplierIds)
      quotes[id] = { error: "Pin this address on the map (Addresses) to get a live delivery price. The standard fee applies." };
    return { ok: true, quotes };
  }

  const admin = createAdminClient();
  const { data: pickups, error: pickupError } = await admin
    .from("supplier_pickup_settings")
    .select("supplier_id, lat, lng, lalamove_service_type, line1, line2, barangay, city, province, postal_code")
    .in("supplier_id", supplierIds);
  if (pickupError) {
    console.error("quoteCartShipping: pickup read failed", pickupError.code);
    for (const id of supplierIds) quotes[id] = unavailable;
    return { ok: true, quotes };
  }
  const pickupOf = new Map((pickups ?? []).map((p) => [p.supplier_id, p]));

  await Promise.all(
    supplierIds.map(async (supplierId) => {
      const pickup = pickupOf.get(supplierId);
      const from = pickup && toStop(pickup);
      if (!pickup || !from) {
        quotes[supplierId] = { error: "This supplier has not set a pickup pin yet. The standard delivery fee applies." };
        return;
      }
      try {
        const serviceType = pickup.lalamove_service_type ?? "";
        // Reuse the buyer's newest unexpired saved price: the courier limits quotations per minute.
        const { data: held } = await admin
          .from("courier_quotes")
          .select("id, amount_centavos, expires_at")
          .eq("buyer_id", buyerId)
          .eq("supplier_id", supplierId)
          .eq("address_id", addressId)
          .eq("carrier", courier.name)
          .eq("service_type", serviceType)
          .gt("expires_at", new Date().toISOString())
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (held) {
          quotes[supplierId] = { quoteId: held.id, amountCentavos: held.amount_centavos, expiresAt: held.expires_at };
          return;
        }
        const q = await quote({ pickup: from, dropoff, serviceType: pickup.lalamove_service_type ?? null });
        const { data: saved, error } = await admin
          .rpc("save_courier_quote", {
            p_buyer: buyerId,
            p_supplier: supplierId,
            p_address: addressId,
            p_carrier: courier.name,
            p_service_type: serviceType,
            p_amount_centavos: q.amountCentavos,
          })
          .single();
        if (error) throw error;
        quotes[supplierId] = { quoteId: saved.id, amountCentavos: q.amountCentavos, expiresAt: saved.expires_at };
      } catch (e) {
        // CourierError text is written for suppliers and logs, so buyers get the neutral message.
        console.error("quoteCartShipping failed", e instanceof CourierError ? e.message : e instanceof Error ? e.name : "unknown");
        quotes[supplierId] = unavailable;
      }
    }),
  );
  return { ok: true, quotes };
}

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
      p_quote_ids: input.data.quoteIds,
    })
    .single();
  if (error) return dbError(error) as Fail;
  // COD with nothing due online is already confirmed.
  if (data.amount_centavos === 0) return { ok: true, redirectUrl: "/buyer/orders" };
  return sendToGateway(data.checkout_id, data.amount_centavos, input.data.method);
}

/**
 * Buyer abandons an unpaid cart checkout (e.g. pressed Back on the payment page): closes the gateway
 * session first, then the database cancels the orders and returns the held stock. The cart is kept.
 */
export async function cancelCheckout(checkoutId: string): Promise<ActionResult> {
  if (!uuid.safeParse(checkoutId).success) return { ok: false, error: "Not found" };
  const supabase = await createClient();
  const { data: pay } = await supabase.from("payments").select("provider_ref, status").eq("checkout_id", checkoutId).maybeSingle();
  if (!pay) return { ok: false, error: "Not found" };
  if (pay.status !== "pending") return { ok: false, error: "This payment is already closed." };
  if (pay.provider_ref) {
    try {
      await getPaymentProvider().cancelSession(pay.provider_ref);
    } catch {
      return { ok: false, error: "We could not close the payment page. Finish paying there, or try again in a few minutes." };
    }
  }
  const { error } = await supabase.rpc("cancel_checkout", { p_checkout_id: checkoutId });
  if (error) return dbError(error);
  updateTag(CATALOG_TAG); // held stock is back on sale
  return { ok: true };
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

const payNowSchema = z.object({ method, idempotencyKey: uuid });

/**
 * Buyer: pays for a chat deal both parties confirmed. The database creates the order at the accepted offer's exact
 * terms and returns what is due now (the agreed downpayment, or the full total). Returns where to pay.
 */
export async function startAgreementCheckout(
  agreementId: string,
  raw: Record<string, unknown>,
): Promise<{ ok: true; redirectUrl: string } | Fail> {
  if (!uuid.safeParse(agreementId).success) return { ok: false, error: "Not found" };
  const input = parseInput(payNowSchema, raw);
  if (!input.ok) return input;
  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("start_agreement_checkout", {
      p_agreement_id: agreementId,
      p_idempotency_key: input.data.idempotencyKey,
      p_method: input.data.method,
    })
    .single();
  if (error) return dbError(error) as Fail;
  return sendToGateway(data.checkout_id, data.amount_centavos, input.data.method);
}

/** Buyer: pays the rest of a split order (downpayment already paid). Returns where to pay. */
export async function startBalanceCheckout(
  orderId: string,
  raw: Record<string, unknown>,
): Promise<{ ok: true; redirectUrl: string } | Fail> {
  if (!uuid.safeParse(orderId).success) return { ok: false, error: "Not found" };
  const input = parseInput(payNowSchema, raw);
  if (!input.ok) return input;
  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("start_balance_checkout", {
      p_order_id: orderId,
      p_idempotency_key: input.data.idempotencyKey,
      p_method: input.data.method,
    })
    .single();
  if (error) return dbError(error) as Fail;
  return sendToGateway(data.checkout_id, data.amount_centavos, input.data.method);
}

/** Buyer: pays the extra delivery cost when the courier's final price was higher than quoted. Returns where to pay. */
export async function payShippingDifference(
  orderId: string,
  raw: Record<string, unknown>,
): Promise<{ ok: true; redirectUrl: string } | Fail> {
  if (!uuid.safeParse(orderId).success) return { ok: false, error: "Not found" };
  const input = parseInput(payNowSchema, raw);
  if (!input.ok) return input;
  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("start_shipping_topup_checkout", {
      p_order_id: orderId,
      p_idempotency_key: input.data.idempotencyKey,
      p_method: input.data.method,
    })
    .single();
  if (error) return dbError(error) as Fail;
  return sendToGateway(data.checkout_id, data.amount_centavos, input.data.method);
}

/** Supplier: reminds the buyer to pay the balance of a split order. */
export async function requestBalance(orderId: string): Promise<ActionResult> {
  if (!uuid.safeParse(orderId).success) return { ok: false, error: "Not found" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("request_balance", { p_order_id: orderId });
  return error ? dbError(error) : { ok: true };
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
  // Call the webhook handler in-process: same signature and idempotency path, and it works on previews
  // where the site cannot reach its own URL (no NEXT_PUBLIC_SITE_URL, or deployment protection).
  const res = await paymentWebhook(new Request("http://internal/api/webhooks/payments", { method: "POST", headers, body }));
  if (!res.ok) return { ok: false, error: "The payment could not be recorded. Try again." };
  return { ok: true };
}

// ---------------------------------------------------------------- refunds


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

/** Finance: re-send a refund stuck in pending. */
export async function retryRefund(refundId: string): Promise<ActionResult> {
  if (!uuid.safeParse(refundId).success) return { ok: false, error: "Not found" };
  return retryPendingRefund(refundId);
}

/** Finance: send again a refund the gateway refused (a new refund; claims follow it). */
export async function reissueRefund(refundId: string, idempotencyKey: string): Promise<ActionResult> {
  if (!uuid.safeParse(refundId).success || !uuid.safeParse(idempotencyKey).success) return { ok: false, error: "Not found" };
  const supabase = await createClient();
  const { data: newId, error } = await supabase.rpc("admin_reissue_refund", { p_refund_id: refundId, p_idempotency_key: idempotencyKey });
  if (error) return dbError(error);
  return settleRefund(newId);
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
  if (error) return dbError(error);
  updateTag(CATALOG_TAG);
  return { ok: true };
}

/**
 * Sets units available for a listing or one option; blank = stop tracking (made to order). `expected` is the
 * value the supplier's page showed: the database refuses the save when an order changed it since.
 */
export async function setStock(productId: string, variantId: string | null, stock: string, expected: number | null): Promise<ActionResult> {
  if (!uuid.safeParse(productId).success || (variantId !== null && !uuid.safeParse(variantId).success)) return { ok: false, error: "Not found" };
  const s = stock.trim() === "" ? null : z.coerce.number().int().min(0).max(MAX_QUANTITY).safeParse(stock);
  if (s !== null && !s.success) return { ok: false, error: "Stock is a whole number of 0 or more" };
  if (expected !== null && !Number.isInteger(expected)) return { ok: false, error: "Reload the page and try again" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_stock", {
    p_product_id: productId,
    p_variant_id: variantId as string, // null = the listing itself
    p_stock: (s === null ? null : s.data) as number,
    p_expected: expected as number, // null = was not tracked
  });
  if (error) return dbError(error);
  updateTag(CATALOG_TAG);
  return { ok: true };
}
