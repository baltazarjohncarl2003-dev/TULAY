"use server";

import { z } from "zod";
import { type ActionResult, dbError, parseInput } from "@/lib/action-result";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { contactSchema } from "@/lib/validation/forms";
import { visitorHash } from "@/lib/visitor";

/** Public contact form: stored for TULAY support (and support is notified). */
export async function submitContact(raw: Record<string, unknown>): Promise<ActionResult> {
  const input = parseInput(contactSchema, raw);
  if (!input.ok) return input;
  const { topic, name, email, reference, message } = input.data;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  // Service role: the per-visitor limit needs the sender's hashed id, which only the server can vouch for.
  const { error } = await createAdminClient().rpc("submit_contact_message", {
    p_topic: topic,
    p_name: name,
    p_email: email,
    p_reference: reference,
    p_message: message,
    p_client: await visitorHash(auth.user?.id),
    p_user_id: auth.user?.id,
  });
  return error ? dbError(error) : { ok: true };
}

/** Support: mark a contact message handled. */
export async function handleContactMessage(id: string): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Not found" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_handle_contact_message", { p_id: id });
  return error ? dbError(error) : { ok: true };
}
