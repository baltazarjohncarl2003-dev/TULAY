"use server";

import { z } from "zod";
import { type ActionResult, dbError, parseInput } from "@/lib/action-result";
import type { ChatList } from "@/lib/chats";
import { loadChats } from "@/lib/data/chats";
import { createClient } from "@/lib/supabase/server";
import { directRfqSchema, messageSchema } from "@/lib/validation/forms";

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

export async function markChatRead(id: string): Promise<ActionResult> {
  if (!threadId.safeParse(id).success) return notFound;
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_chat_read", { p_thread_id: id });
  return error ? dbError(error) : { ok: true };
}
