"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { aiSplitNeeds } from "@/lib/ai/needs";
import type { Need } from "@/lib/matching/needs";
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_LENGTH = 1000;

/** Gemini's reading of the request, or null so the page falls back to the rule-based split. */
export async function readNeeds(request: unknown): Promise<Need[] | null> {
  if (typeof request !== "string") return null;
  const text = request.trim().slice(0, MAX_LENGTH);
  if (!text || !process.env.GEMINI_API_KEY) return null;

  // Rate limit per visitor and per day (admin settings). Over the limit, the page uses the basic matcher.
  // shortcut: keyed by IP, so visitors behind one carrier NAT share a limit; key by user id too if that bites.
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const db = createAdminClient();
  const { data: allowed, error } = await db.rpc("take_ai_call", { p_client: createHash("sha256").update(ip).digest("hex") });
  if (error || !allowed) return null;

  const needs = await aiSplitNeeds(text);
  if (!needs?.length) return needs;
  // Drop banned items (admin list). Listings can't contain them anyway; this keeps them out of the AI's reading.
  const { data: hits, error: banError } = await db.rpc("banned_terms_in", { p_texts: needs.map((n) => n.text) });
  if (banError) return null;
  return needs.filter((_, i) => !hits?.[i]);
}
