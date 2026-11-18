"use server";

import { z } from "zod";
import { type ActionResult, dbError } from "@/lib/action-result";
import { getSessionUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const rfqId = z.string().uuid();

/** A verified supplier asks to quote on a board request. The database checks the supplier, the request and the owner. */
export async function respondToBoardRequest(id: string): Promise<ActionResult> {
  const parsed = rfqId.safeParse(id);
  if (!parsed.success) return { ok: false, error: "Not found" };
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Sign in first." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("respond_to_board_request", { p_rfq_id: parsed.data });
  if (error) return dbError(error);
  return { ok: true };
}
