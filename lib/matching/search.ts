// TULAY AI preview: rule-based ranking in the browser over the live listings it is given (no model).
// shortcut: synonyms duplicate the search_synonyms seed; switch the preview to search_catalog when AI matching becomes real.
import { categoryName } from "@/lib/categories";
import type { Product, Supplier } from "@/lib/demo/types";

export type SearchHit = { product: Product; supplier: Supplier; score: number; reasons: string[] };
export type SearchResult = { parsed: { quantity: number | null; keywords: string[] }; hits: SearchHit[]; total: number; more: boolean };

export const SEARCH_LIMIT = 24;

// Stored in singular form, because tokens are singularized before the stop check.
const STOP_WORDS = new Set(["i", "need", "want", "a", "an", "the", "for", "of", "and", "with", "pc", "piece"]);

const SYNONYM_PAIRS: [string, string][] = [
  ["pouch", "sachet"],
  ["box", "carton"],
  ["bottle", "jar"],
  ["label", "sticker"],
  ["cup", "tub"],
  ["paper", "kraft"], // "paper bag" <-> "kraft bag"
  ["tee", "shirt"],
  ["tumbler", "mug"],
  ["lanyard", "id"],
];

/** Bidirectional: every pair is listed under both words. */
export const SYNONYMS: Record<string, string[]> = {};
for (const [a, b] of SYNONYM_PAIRS) {
  (SYNONYMS[a] ??= []).push(b);
  (SYNONYMS[b] ??= []).push(a);
}

// Field weights: a keyword is scored by its best (first matching) field.
const FIELDS = ["title", "category", "description", "supplier"] as const;
type Field = (typeof FIELDS)[number];
const WEIGHT: Record<Field, number> = { title: 60, category: 25, description: 10, supplier: 5 };

function singular(word: string): string {
  if (/(ss|x|ch|sh|z)es$/.test(word)) return word.slice(0, -2);
  if (/[^s]s$/.test(word)) return word.slice(0, -1);
  return word;
}

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((w) => w && !/^\d+$/.test(w))
    .map(singular)
    .filter((w) => !STOP_WORDS.has(w));
}

/** First number in the query, commas allowed ("5,000" -> 5000). */
function parseQuantity(query: string): number | null {
  const m = /\d{1,3}(?:,\d{3})+|\d+/.exec(query);
  return m ? Number(m[0].replace(/,/g, "")) : null;
}

export function smartSearch(query: string, products: Product[], suppliers: Supplier[]): SearchResult {
  const quantity = parseQuantity(query);
  const keywords = [...new Set(tokens(query))];
  if (keywords.length === 0) return { parsed: { quantity, keywords }, hits: [], total: 0, more: false };

  const supplierById = new Map(suppliers.map((s) => [s.id, s]));
  const hits: SearchHit[] = [];

  for (const p of products) {
    const s = supplierById.get(p.supplierId);
    if (p.status !== "approved" || !s || s.status !== "approved") continue;

    const sets: Record<Field, Set<string>> = {
      title: new Set(tokens(p.title)),
      category: new Set(tokens(categoryName(p.categorySlug))),
      description: new Set(tokens(p.description)),
      supplier: new Set(tokens(s.keywords)),
    };

    const reasons = new Set<string>();
    let sum = 0;
    let matched = 0;
    let titleOnly = true;

    for (const k of keywords) {
      const aliases = [k, ...(SYNONYMS[k] ?? [])];
      let found: { field: Field; word: string } | null = null;
      for (const field of FIELDS) {
        const word = aliases.find((a) => sets[field].has(a));
        if (word) {
          found = { field, word };
          break;
        }
      }
      if (!found) {
        titleOnly = false;
        continue;
      }
      matched++;
      sum += WEIGHT[found.field];
      if (found.field !== "title") titleOnly = false;
      if (found.field === "title") reasons.add(`Title matches “${found.word}”`);
      if (found.field === "category") reasons.add(`Category: ${categoryName(p.categorySlug)}`);
      if (found.field === "description") reasons.add(`Description mentions “${found.word}”`);
      if (found.field === "supplier") reasons.add(`Supplier keywords match “${found.word}”`);
    }

    if (matched === 0) continue;

    let score = Math.round(sum / keywords.length);
    if (titleOnly) score += 15;
    if (quantity !== null && quantity >= p.moq) {
      score += 20;
      reasons.add(`Meets MOQ of ${p.moq}`);
    }
    hits.push({ product: p, supplier: s, score, reasons: [...reasons] });
  }

  hits.sort((a, b) => b.score - a.score || a.product.title.localeCompare(b.product.title));
  return {
    parsed: { quantity, keywords },
    hits: hits.slice(0, SEARCH_LIMIT),
    total: hits.length,
    more: hits.length > SEARCH_LIMIT,
  };
}
