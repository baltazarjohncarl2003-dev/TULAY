"use server";

import { aiSplitNeeds } from "@/lib/ai/needs";
import type { Need } from "@/lib/matching/needs";

const MAX_LENGTH = 1000;

// shortcut: public and not rate-limited, so anyone can spend Gemini quota; add a per-IP limit before launch.
/** Gemini's reading of the request, or null so the page falls back to the rule-based split. */
export async function readNeeds(request: unknown): Promise<Need[] | null> {
  if (typeof request !== "string") return null;
  const text = request.trim().slice(0, MAX_LENGTH);
  return text ? aiSplitNeeds(text) : null;
}
