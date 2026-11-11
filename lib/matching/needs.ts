export type Need = { text: string; quantity: number | null };

const MAX_NEEDS = 8;
// "budget 100,000", "my budget is ₱100k", "under PHP 5,000". Decimals do not match on purpose.
const BUDGET_SRC =
  String.raw`(?:(?:my|our)\s+)?(?:budget|under)(?:\s+(?:is|of))?\s*(?:₱|php|p)?\s*(\d+(?:,\d{3})*)(k)?(?![\d.]\d|\d)`;

/** Integer centavos from a budget phrase, or null. Integer math only. */
export function parseBudgetCentavos(request: string): number | null {
  const m = new RegExp(BUDGET_SRC, "i").exec(request);
  if (!m) return null;
  const pesos = parseInt(m[1].replace(/,/g, ""), 10) * (m[2] ? 1000 : 1);
  const centavos = pesos * 100;
  return Number.isSafeInteger(centavos) && centavos > 0 ? centavos : null;
}

/** Split a plain-language request into separate needs (rule-based, no AI). */
export function splitNeeds(request: string): Need[] {
  let text = request;

  // 1. Drop leading context before a colon or "I need" / "we need" / "need".
  const colon = text.indexOf(":");
  const need = /\b(?:(?:i|we)\s+)?need\s+/i.exec(text);
  if (need && (colon === -1 || need.index < colon)) text = text.slice(need.index + need[0].length);
  else if (colon !== -1) text = text.slice(colon + 1);

  // 3. Budget phrases go first so their commas do not split the text.
  text = text.replace(new RegExp(BUDGET_SRC, "gi"), " ");

  // 2. Commas inside numbers (10,000) are kept.
  const parts = text.split(/,(?!\d{3}\b)|;|\n|\.\s+|\s+and\s+|\s+plus\s+|\s*&\s*/i);

  const seen = new Set<string>();
  const needs: Need[] = [];
  for (const raw of parts) {
    const t = raw
      .replace(/^(?:and|plus)\s+/i, "")
      .replace(/^[\s.,;:!?-]+|[\s.,;:!?-]+$/g, "");
    if ((t.match(/\p{L}/gu) ?? []).length < 3) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const n = /\d+(?:,\d{3})*/.exec(t);
    needs.push({ text: t, quantity: n ? Number(n[0].replace(/,/g, "")) : null });
    if (needs.length === MAX_NEEDS) break;
  }
  return needs;
}
