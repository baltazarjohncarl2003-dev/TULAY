"use server";

import { z } from "zod";
import { type ActionResult, dbError, parseInput } from "@/lib/action-result";
import type { ChatList } from "@/lib/chats";
import { loadChats } from "@/lib/data/chats";
import { createClient } from "@/lib/supabase/server";
import { messageSchema } from "@/lib/validation/forms";

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

export async function markChatRead(id: string): Promise<ActionResult> {
  if (!threadId.safeParse(id).success) return notFound;
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_chat_read", { p_thread_id: id });
  return error ? dbError(error) : { ok: true };
}
