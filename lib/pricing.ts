import type { PriceTier } from "@/lib/types";

/**
 * Unit price at a quantity, the way start_checkout charges it: the highest tier whose minQty <= qty,
 * else the indicative price; plus the option's price change. null = price on request.
 * Display only: the database recomputes at checkout.
 */
export function unitPriceFor(
  indicativeCentavos: number | null,
  tiers: PriceTier[],
  qty: number,
  optionDeltaCentavos = 0,
): number | null {
  let base = indicativeCentavos;
  let best = 0;
  for (const t of tiers) {
    if (t.minQty <= qty && t.minQty > best) {
      best = t.minQty;
      base = t.unitPriceCentavos;
    }
  }
  if (base === null) return null;
  const unit = base + optionDeltaCentavos;
  return unit > 0 ? unit : null;
}
