import type { Quote } from "@/lib/types";

/** Unit price for an order of `qty`: the highest tier whose minQty <= qty, else the base unit price. */
export function unitPriceAt(quote: Quote, qty: number): number {
  let unit = quote.unitPriceCentavos;
  let best = 0;
  for (const t of quote.priceTiers) {
    if (t.minQty <= qty && t.minQty > best) {
      best = t.minQty;
      unit = t.unitPriceCentavos;
    }
  }
  return unit;
}

export type FeeName = "setup" | "shipping" | "tax";

export type QuoteComparison = {
  quote: Quote;
  unitPriceCentavos: number;
  subtotalCentavos: number;
  /** Subtotal plus every fee the supplier provided. */
  totalCentavos: number;
  /** Fees the supplier left blank (not zero): the total excludes them. */
  missing: FeeName[];
  lowestTotal: boolean;
  fastest: boolean;
};

/**
 * Compares quotes at the buyer's quantity, in integer centavos. Display only: the server recomputes
 * before anything is recorded. Highlights are set only when there are 2+ quotes; ties share them.
 */
export function compareQuotes(quotes: Quote[], qty: number): QuoteComparison[] {
  const rows = quotes.map((quote) => {
    const unit = unitPriceAt(quote, qty);
    const subtotal = unit * qty;
    const fees: [FeeName, number | null][] = [
      ["setup", quote.setupFeeCentavos],
      ["shipping", quote.shippingFeeCentavos],
      ["tax", quote.taxCentavos],
    ];
    const total = subtotal + fees.reduce((sum, [, f]) => sum + (f ?? 0), 0);
    if (!Number.isSafeInteger(total)) throw new RangeError("Quote total is out of range");
    return {
      quote,
      unitPriceCentavos: unit,
      subtotalCentavos: subtotal,
      totalCentavos: total,
      missing: fees.filter(([, f]) => f === null).map(([n]) => n),
      lowestTotal: false,
      fastest: false,
    };
  });
  if (rows.length < 2) return rows;
  const minTotal = Math.min(...rows.map((r) => r.totalCentavos));
  const minLead = Math.min(...rows.map((r) => r.quote.leadDays));
  return rows.map((r) => ({ ...r, lowestTotal: r.totalCentavos === minTotal, fastest: r.quote.leadDays === minLead }));
}
