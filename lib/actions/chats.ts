"use server";

import { z } from "zod";
import { type ActionResult, dbError, parseInput } from "@/lib/action-result";
import type { ChatList } from "@/lib/chats";
import { loadChats } from "@/lib/data/chats";
import { createClient } from "@/lib/supabase/server";
import { chatOfferSchema, directRfqSchema, messageSchema } from "@/lib/validation/forms";

const uuid = z.string().uuid();
const threadId = z.string().max(73);
type Fail = Exclude<ActionResult, { ok: true }>;
const notFound: Fail = { ok: false, error: "Conversation not found" };

/** The signed-in user's chats for the messages dropdown. Null for visitors and admins. */
export async function fetchChats(): Promise<ChatList | null> {
  return loadChats();
}

/** Starts (supplierId) or continues (conversationId) a direct chat. A retry with the same key sends nothing new. */
export async function sendDirectMessage(
  target: { conversationId: string | null; supplierId: string | null },
  raw: Record<string, unknown>,
  idempotencyKey: string,
): Promise<{ ok: true; conversationId: string } | Fail> {
  const { conversationId, supplierId } = target;
  if (conversationId === null && supplierId === null) return notFound;
  if (conversationId !== null && !uuid.safeParse(conversationId).success) return notFound;
  if (supplierId !== null && !uuid.safeParse(supplierId).success) return notFound;
  if (!uuid.safeParse(idempotencyKey).success) return { ok: false, error: "Please reload and try again." };
  const input = parseInput(messageSchema, raw);
  if (!input.ok) return input;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("send_direct_message", {
    p_conversation_id: conversationId as string,
    p_supplier_id: supplierId as string,
    p_body: input.data.body,
    p_idempotency_key: idempotencyKey,
  });
  if (error) return dbError(error) as Fail;
  return { ok: true, conversationId: data };
}

/** Buyer: a private RFQ to one supplier (optionally about one of its listings), posted as a card in their chat. */
export async function sendDirectRfq(
  target: { supplierId: string; productId: string | null },
  raw: Record<string, unknown>,
  idempotencyKey: string,
): Promise<{ ok: true; conversationId: string } | Fail> {
  const { supplierId, productId } = target;
  if (!uuid.safeParse(supplierId).success || (productId !== null && !uuid.safeParse(productId).success)) return notFound;
  if (!uuid.safeParse(idempotencyKey).success) return { ok: false, error: "Please reload and try again." };
  const input = parseInput(directRfqSchema, raw);
  if (!input.ok) return input;
  const d = input.data;
  if (productId === null && !d.productName) return { ok: false, error: "Name the product you need." };
  if (d.targetPrice === 0) return { ok: false, error: "Enter a target price above zero, or leave it blank." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("send_direct_rfq", {
    p_supplier_id: supplierId,
    p_product_id: productId as string, // null = not about a listing; the generated types do not mark it nullable
    p_product_name: d.productName,
    p_product_type: d.productType,
    p_quantity: d.quantity,
    p_unit: d.unit,
    p_target_price_centavos: d.targetPrice as number,
    p_specs: d.specs,
    p_city: d.city,
    p_province: d.province,
    p_required_by: (d.requiredBy ?? null) as string,
    p_notes: d.notes,
    p_idempotency_key: idempotencyKey,
  });
  if (error) return dbError(error) as Fail;
  return { ok: true, conversationId: data };
}

/**
 * Either party: a new offer (relatedOfferId null, only when no offer is open) or a counter to the other party's
 * open offer (relatedOfferId = that offer). Totals and the downpayment amount are worked out by the server.
 */
export async function makeChatOffer(
  target: { conversationId: string; relatedOfferId: string | null },
  raw: Record<string, unknown>,
  idempotencyKey: string,
): Promise<{ ok: true; offerId: string } | Fail> {
  const { conversationId, relatedOfferId } = target;
  if (!uuid.safeParse(conversationId).success || (relatedOfferId !== null && !uuid.safeParse(relatedOfferId).success)) {
    return notFound;
  }
  if (!uuid.safeParse(idempotencyKey).success) return { ok: false, error: "Please reload and try again." };
  const input = parseInput(chatOfferSchema, raw);
  if (!input.ok) return input;
  const d = input.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("make_chat_offer", {
    p_conversation_id: conversationId,
    p_related_offer_id: relatedOfferId as string, // null = a new offer; the generated types do not mark it nullable
    p_product_name: d.productName,
    p_product_type: d.productType,
    p_specs: d.specs,
    p_unit: d.unit,
    p_quantity: d.quantity,
    p_unit_price_centavos: d.unitPrice as number, // requiredMoney: never null here
    p_shipping_fee_centavos: d.shippingFee,
    p_lead_days: d.leadDays,
    p_downpayment_bps: d.downpaymentPercent,
    p_payment_terms: d.paymentTerms,
    p_conditions: d.conditions,
    p_idempotency_key: idempotencyKey,
  });
  if (error) return dbError(error) as Fail;
  return { ok: true, offerId: data };
}

const offerAnswer = z.enum(["accept", "reject", "withdraw"]);

/** Accept or reject the other party's open offer, or withdraw your own. offerId must be that exact revision. */
export async function respondChatOffer(
  offerId: string,
  action: "accept" | "reject" | "withdraw",
  idempotencyKey: string,
): Promise<ActionResult> {
  if (!uuid.safeParse(offerId).success) return { ok: false, error: "Offer not found" };
  if (!offerAnswer.safeParse(action).success) return { ok: false, error: "Unknown action" };
  if (!uuid.safeParse(idempotencyKey).success) return { ok: false, error: "Please reload and try again." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("respond_chat_offer", {
    p_offer_id: offerId,
    p_action: action,
    p_idempotency_key: idempotencyKey,
  });
  return error ? dbError(error) : { ok: true };
}

const returnClass = z.enum(["standard", "custom", "final_sale"]);

/**
 * Order details for an accepted offer: the buyer sets the delivery address, the supplier the return class.
 * Each change is a new version that both parties confirm again.
 */
export async function updateAgreement(
  acceptId: string,
  change: { addressId: string } | { returnClass: "standard" | "custom" | "final_sale" },
): Promise<ActionResult> {
  if (!uuid.safeParse(acceptId).success) return { ok: false, error: "Offer not found" };
  const addressId = "addressId" in change ? change.addressId : null;
  const cls = "returnClass" in change ? change.returnClass : null;
  if (addressId !== null && !uuid.safeParse(addressId).success) return { ok: false, error: "Choose a delivery address" };
  if (cls !== null && !returnClass.safeParse(cls).success) return { ok: false, error: "Choose a return class" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_agreement", {
    p_accept_id: acceptId,
    p_address_id: addressId as string, // null = keep; the generated types do not mark it nullable
    p_return_class: cls as "standard",
  });
  return error ? dbError(error) : { ok: true };
}

/** Confirms one exact, complete, latest version of the order details. */
export async function confirmAgreement(agreementId: string): Promise<ActionResult> {
  if (!uuid.safeParse(agreementId).success) return { ok: false, error: "Order details not found" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("confirm_agreement", { p_agreement_id: agreementId });
  return error ? dbError(error) : { ok: true };
}

export async function markChatRead(id: string): Promise<ActionResult> {
  if (!threadId.safeParse(id).success) return notFound;
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_chat_read", { p_thread_id: id });
  return error ? dbError(error) : { ok: true };
}
