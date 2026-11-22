"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { z } from "zod";
import { fallbackTitle } from "@/lib/ai/chat-title";
import { aiBasketTurn, needSchema } from "@/lib/ai/needs";
import { listLiveCatalog, listLiveProductsByIds } from "@/lib/data/catalog";
import { getNumberSettings } from "@/lib/data/settings";
import { rankNeed, type BasketLine, type BasketNeed, type Candidate } from "@/lib/matching/basket";
import { splitNeeds } from "@/lib/matching/needs";
import { smartSearch } from "@/lib/matching/search";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const MAX_LENGTH = 1000;
const MAX_MESSAGES = 20;
const MAX_CHATS_LISTED = 100;
const CANDIDATES_PER_NEED = 8;
// shortcut: relevance floor relative to the best match; replace with search_catalog ranking past ~1,000 listings.
const RELEVANCE_FLOOR = 0.6;

const uuid = z.string().uuid();
const inputSchema = z.object({
  messages: z.array(z.string().trim().min(1).max(MAX_LENGTH)).min(1).max(MAX_MESSAGES),
  needs: z.array(needSchema).max(20),
  chatId: uuid.optional(),
});
const savedChatSchema = z.object({
  turns: z.array(z.object({ message: z.string(), reply: z.string() })),
  needs: z.array(needSchema),
});

export type BasketProposal = {
  /** TULAY AI's chat reply. */
  reply: string | null;
  lines: BasketLine[];
};
export type AiChatSummary = { id: string; title: string; updatedAt: string };
export type AiChatDetail = { messages: string[]; replies: string[]; lines: BasketLine[] };

/**
 * One chat turn: Gemini updates the list of needs, then TULAY's own code finds and prices the best deal for each.
 * `messages` are the buyer's messages so far (oldest first); `needs` is the list the page currently shows.
 * With `chatId`, a signed-in buyer's turn is saved to their history.
 */
export async function proposeBasket(raw: unknown): Promise<BasketProposal | null> {
  const input = inputSchema.safeParse(raw);
  if (!input.success) return null;
  const { messages, needs: current, chatId } = input.data;
  const { ai_max_items: maxItems } = await getNumberSettings(["ai_max_items"]);

  let reply: string | null = null;
  let title: string | undefined;
  let needs: BasketNeed[];
  const turn = (await takeAiCall()) ? await aiBasketTurn(messages, current, maxItems) : null;
  if (turn) {
    ({ reply, needs, title } = turn);
  } else if (current.length > 0) {
    // Follow-up without AI: keep the basket rather than replacing it with a rough rule-based reading.
    reply = "TULAY AI is busy or you've used today's AI searches. Your list is unchanged; edit the items below or try again later.";
    needs = current;
  } else {
    needs = splitNeeds(messages.at(-1)!).slice(0, maxItems).map((n) => ({ ...n, preference: "cheapest" as const }));
  }

  const priced = await priceNeeds(needs);
  if (!priced) return null;
  const finalReply =
    reply ||
    (priced.lines.length === 0
      ? "Nothing to buy found in that. Try naming products, like “500 mailer boxes”."
      : `Found ${priced.lines.length} ${priced.lines.length === 1 ? "item" : "items"} in your request`);

  if (chatId) {
    // History is a convenience: a failed save must not lose the buyer's answer.
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    if (data.user) {
      const { error } = await supabase.rpc("save_ai_turn", {
        p_id: chatId,
        p_turn: messages.length - 1,
        p_message: messages.at(-1)!,
        p_reply: finalReply,
        p_title: title || fallbackTitle(messages[0]),
        p_needs: priced.lines.map((l) => l.need),
      });
      if (error) console.error("AI chat save failed", error.code);
    }
  }
  return { reply: finalReply, lines: priced.lines };
}

/** Drops banned needs, then finds and prices live listings for the rest. Null when the banned-term check fails. */
async function priceNeeds(input: BasketNeed[]): Promise<{ lines: BasketLine[] } | null> {
  let needs = input;
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
  return { lines };
}

/** The signed-in user's saved AI chats, newest first. Null for visitors. RLS limits this to their own rows. */
export async function listAiChats(): Promise<AiChatSummary[] | null> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data, error } = await supabase
    .from("ai_chats")
    .select("id, title, updated_at")
    .order("updated_at", { ascending: false })
    .limit(MAX_CHATS_LISTED);
  if (error) return [];
  return data.map((c) => ({ id: c.id, title: c.title, updatedAt: c.updated_at }));
}

/** Reopens a saved chat with fresh prices and no AI call. Null when it isn't this user's or can't be read. */
export async function openAiChat(id: string): Promise<AiChatDetail | null> {
  if (!uuid.safeParse(id).success) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.from("ai_chats").select("turns, needs").eq("id", id).maybeSingle();
  if (error || !data) return null;
  const saved = savedChatSchema.safeParse(data);
  if (!saved.success) return null;
  const priced = await priceNeeds(saved.data.needs);
  return {
    messages: saved.data.turns.map((t) => t.message),
    replies: saved.data.turns.map((t) => t.reply),
    lines: priced?.lines ?? [],
  };
}

export async function deleteAiChat(id: string): Promise<boolean> {
  if (!uuid.safeParse(id).success) return false;
  const supabase = await createClient();
  const { error } = await supabase.from("ai_chats").delete().eq("id", id);
  return !error;
}

/** True when this visitor may make a Gemini call (per-minute, per-visitor-day and site-wide limits are admin settings). */
async function takeAiCall(): Promise<boolean> {
  if (!process.env.GEMINI_API_KEY) return false;
  // Signed-in visitors are counted per account (no shared carrier-NAT limit); everyone else per IP.
  const { data } = await (await createClient()).auth.getUser();
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const visitor = data.user ? `user:${data.user.id}` : `ip:${ip}`;
  const { data: allowed, error } = await createAdminClient().rpc("take_ai_call", {
    p_client: createHash("sha256").update(visitor).digest("hex"),
  });
  return !error && !!allowed;
}
