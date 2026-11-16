// TULAY AI basket: picks the best deal for each need from live listings. Prices are integer centavos,
// computed the way start_checkout charges them (lib/pricing). Display only: checkout reprices in the database.
import { unitPriceFor } from "@/lib/pricing";
import type { Need } from "@/lib/matching/needs";
import type { Product, Supplier } from "@/lib/types";

/** What "best deal" means for a need. The AI reads it from the prompt; default cheapest. */
export type Preference = "cheapest" | "fastest";
export const PREFERENCES = ["cheapest", "fastest"] as const;
export type BasketNeed = Need & { preference: Preference };

export type BasketOption = {
  product: Product;
  supplier: Supplier;
  /** Quantity the price is for: the requested quantity, or the MOQ when none was stated. */
  quantity: number;
  unitCentavos: number;
  lineCentavos: number;
  /** True when the listing has options and this is the cheapest one ("from" price); the buyer must pick one. */
  fromPrice: boolean;
  leadDays: number;
  reasons: string[];
  /** Problems that stop checkout as-is (below MOQ, not enough stock, over the supplier's maximum). */
  blockers: string[];
};
export type BasketLine = { need: BasketNeed; options: BasketOption[] };
export type Candidate = { product: Product; supplier: Supplier; score: number };

export const OPTIONS_PER_LINE = 3;

/** Best-first options for one need. Unpriced listings are skipped; no options means "request quotes". */
export function rankNeed(need: BasketNeed, candidates: Candidate[]): BasketLine {
  const priced: (BasketOption & { score: number })[] = [];
  for (const { product: p, supplier: s, score } of candidates) {
    const quantity = need.quantity ?? p.moq;
    const tiers = p.priceTiers ?? [];
    const variants = p.variants ?? [];
    const units = (variants.length > 0 ? variants.map((v) => v.priceDeltaCentavos) : [0])
      .map((delta) => unitPriceFor(p.indicativePriceCentavos, tiers, quantity, delta))
      .filter((u): u is number => u !== null);
    if (units.length === 0) continue;
    const unitCentavos = Math.min(...units);
    const lineCentavos = unitCentavos * quantity;
    if (!Number.isSafeInteger(lineCentavos)) continue;

    const blockers: string[] = [];
    if (quantity < p.moq) blockers.push(`Minimum order is ${p.moq.toLocaleString("en-PH")} ${p.unit}`);
    const stock = variants.length > 0 ? null : (p.stock ?? null); // option stock is checked once an option is picked
    if (stock !== null && stock < quantity) blockers.push(`Only ${stock.toLocaleString("en-PH")} in stock`);
    if (s.maxQuantity !== null && quantity > s.maxQuantity)
      blockers.push(`Supplier takes up to ${s.maxQuantity.toLocaleString("en-PH")} per order`);

    const reasons: string[] = [];
    if (need.quantity === null) reasons.push(`No quantity given, priced at the MOQ of ${p.moq.toLocaleString("en-PH")}`);
    else if (quantity >= p.moq) reasons.push(`Meets the MOQ of ${p.moq.toLocaleString("en-PH")}`);
    const leadDays = p.leadDays ?? s.leadDays;
    priced.push({
      product: p, supplier: s, quantity, unitCentavos, lineCentavos, fromPrice: variants.length > 0,
      leadDays, reasons, blockers, score,
    });
  }

  const by = need.preference === "fastest"
    ? (a: BasketOption, b: BasketOption) => a.leadDays - b.leadDays || a.lineCentavos - b.lineCentavos
    : (a: BasketOption, b: BasketOption) => a.lineCentavos - b.lineCentavos || a.leadDays - b.leadDays;
  priced.sort(
    (a, b) => Number(a.blockers.length > 0) - Number(b.blockers.length > 0) || by(a, b) || b.score - a.score,
  );

  const options: BasketOption[] = priced.slice(0, OPTIONS_PER_LINE).map(({ score, ...o }) => (void score, o));
  const best = options[0];
  if (best && best.blockers.length === 0 && options.length > 1) {
    best.reasons.unshift(
      need.preference === "fastest" ? `Fastest: ready in ${best.leadDays} days` : `Lowest total at ${best.quantity.toLocaleString("en-PH")} ${best.product.unit}`,
    );
  }
  return { need, options };
}
