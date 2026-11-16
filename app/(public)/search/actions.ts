"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { z } from "zod";
import { aiBasketTurn, needSchema } from "@/lib/ai/needs";
import { listLiveCatalog, listLiveProductsByIds } from "@/lib/data/catalog";
import { getNumberSettings } from "@/lib/data/settings";
import { rankNeed, type BasketLine, type BasketNeed, type Candidate } from "@/lib/matching/basket";
import { splitNeeds } from "@/lib/matching/needs";
import { smartSearch } from "@/lib/matching/search";
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_LENGTH = 1000;
const MAX_MESSAGES = 20;
const CANDIDATES_PER_NEED = 8;
// shortcut: relevance floor relative to the best match; replace with search_catalog ranking past ~1,000 listings.
const RELEVANCE_FLOOR = 0.6;

const inputSchema = z.object({
  messages: z.array(z.string().trim().min(1).max(MAX_LENGTH)).min(1).max(MAX_MESSAGES),
  needs: z.array(needSchema).max(20),
});

export type BasketProposal = {
  /** TULAY AI's chat reply; null when the basic matcher answered. */
  reply: string | null;
  lines: BasketLine[];
};

/**
 * One chat turn: Gemini updates the list of needs, then TULAY's own code finds and prices the best deal for each.
 * `messages` are the buyer's messages so far (oldest first); `needs` is the list the page currently shows.
 */
export async function proposeBasket(raw: unknown): Promise<BasketProposal | null> {
  const input = inputSchema.safeParse(raw);
  if (!input.success) return null;
  const { messages, needs: current } = input.data;
  const { ai_max_items: maxItems } = await getNumberSettings(["ai_max_items"]);

  let reply: string | null = null;
  let needs: BasketNeed[];
  const turn = (await takeAiCall()) ? await aiBasketTurn(messages, current, maxItems) : null;
  if (turn) {
    ({ reply, needs } = turn);
  } else if (current.length > 0) {
    // Follow-up without AI: keep the basket rather than replacing it with a rough rule-based reading.
    reply = "TULAY AI is busy right now. Your list is unchanged; try again in a minute or edit the items below.";
    needs = current;
  } else {
    needs = splitNeeds(messages.at(-1)!).slice(0, maxItems).map((n) => ({ ...n, preference: "cheapest" as const }));
  }

  // Drop banned items (admin list). Listings can't contain them anyway; this keeps them out of the reading.
  if (needs.length > 0) {
    const { data: hits, error } = await createAdminClient().rpc("banned_terms_in", { p_texts: needs.map((n) => n.text) });
    if (error) return null;
    needs = needs.filter((_, i) => !hits?.[i]);
  }

  const { products, suppliers } = await listLiveCatalog();
  const found = needs.map((need) => {
    const hits = smartSearch(need.text, products, suppliers).hits;
    const floor = (hits[0]?.score ?? 0) * RELEVANCE_FLOOR;
    return hits.filter((h) => h.score >= floor).slice(0, CANDIDATES_PER_NEED);
  });
  // The catalog list has no price tiers or options; load them for the candidates only.
  const priced = await listLiveProductsByIds(found.flat().map((h) => h.product.id));
  const byId = new Map(priced.products.map((p) => [p.id, p]));
  const lines = needs.map((need, i) =>
    rankNeed(
      need,
      found[i].flatMap((h): Candidate[] => {
        const product = byId.get(h.product.id);
        return product ? [{ product, supplier: h.supplier, score: h.score }] : [];
      }),
    ),
  );
  return { reply, lines };
}

/** True when this visitor may make a Gemini call (per-IP and per-day limits are admin settings). */
async function takeAiCall(): Promise<boolean> {
  if (!process.env.GEMINI_API_KEY) return false;
  // shortcut: keyed by IP, so visitors behind one carrier NAT share a limit; key by user id too if that bites.
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const { data: allowed, error } = await createAdminClient().rpc("take_ai_call", {
    p_client: createHash("sha256").update(ip).digest("hex"),
  });
  return !error && !!allowed;
}
