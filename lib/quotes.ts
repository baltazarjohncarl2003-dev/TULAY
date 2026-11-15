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

/** An accepted counteroffer's agreed terms (an `accept` offer row): they replace the quote's quantity and price. */
export type AgreedTerms = { quantity: number; unitPriceCentavos: number };

export type QuoteTotal = {
  quantity: number;
  unitPriceCentavos: number;
  subtotalCentavos: number;
  /** Subtotal plus every fee the supplier provided. */
  totalCentavos: number;
  /** Fees the supplier left blank (not zero): the total excludes them, so it is an estimate. */
  missing: FeeName[];
};

/**
 * What select_supplier charges, in integer centavos: the quote's own quantity at its tier price, or an
 * accepted counteroffer's quantity and price. Display only; the database recomputes.
 */
export function quoteTotal(quote: Quote, agreed?: AgreedTerms | null): QuoteTotal {
  const quantity = agreed?.quantity ?? quote.quantity;
  const unit = agreed ? agreed.unitPriceCentavos : unitPriceAt(quote, quantity);
  const subtotal = unit * quantity;
  const fees: [FeeName, number | null][] = [
    ["setup", quote.setupFeeCentavos],
    ["shipping", quote.shippingFeeCentavos],
    ["tax", quote.taxCentavos],
  ];
  const total = subtotal + fees.reduce((sum, [, f]) => sum + (f ?? 0), 0);
  if (!Number.isSafeInteger(total)) throw new RangeError("Quote total is out of range");
  return {
    quantity,
    unitPriceCentavos: unit,
    subtotalCentavos: subtotal,
    totalCentavos: total,
    missing: fees.filter(([, f]) => f === null).map(([n]) => n),
  };
}

export type QuoteComparison = QuoteTotal & {
  quote: Quote;
  /** The quoted quantity is not the quantity the buyer asked for. */
  quantityDiffers: boolean;
  lowestTotal: boolean;
  fastest: boolean;
};

/**
 * Compares quotes, each at its own quoted quantity (what would be charged), in integer centavos.
 * `rfqQty` only flags quotes that differ from the request. Highlights are set only when there are 2+
 * quotes; ties share them.
 */
export function compareQuotes(quotes: Quote[], rfqQty: number): QuoteComparison[] {
  const rows = quotes.map((quote) => ({
    ...quoteTotal(quote),
    quote,
    quantityDiffers: quote.quantity !== rfqQty,
    lowestTotal: false,
    fastest: false,
  }));
  if (rows.length < 2) return rows;
  const minTotal = Math.min(...rows.map((r) => r.totalCentavos));
  const minLead = Math.min(...rows.map((r) => r.quote.leadDays));
  return rows.map((r) => ({ ...r, lowestTotal: r.totalCentavos === minTotal, fastest: r.quote.leadDays === minLead }));
}

/** Each supplier's latest revision for an RFQ. */
export function latestQuotesOf(quotes: Quote[], rfqId: string): Quote[] {
  const latest = new Map<string, Quote>();
  for (const q of quotes) {
    if (q.rfqId !== rfqId) continue;
    const old = latest.get(q.supplierId);
    if (!old || q.revision > old.revision) latest.set(q.supplierId, q);
  }
  return [...latest.values()];
}
