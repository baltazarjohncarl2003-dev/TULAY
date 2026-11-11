import type { ReactNode } from "react";
import { ApprovedBadge } from "@/components/supplier-card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { compareQuotes, type QuoteComparison as Compared } from "@/lib/quotes";
import { supplierById } from "@/lib/demo/data";
import { date, php, qty } from "@/lib/format";
import type { Quote, Rfq } from "@/lib/demo/types";
import { cn } from "@/lib/utils";

const DELIVERY: Record<Quote["deliveryTerms"], string> = {
  supplier_delivery: "Supplier delivers",
  buyer_pickup: "Buyer pickup",
  third_party_freight: "Third-party freight",
};

const BIR: Record<Quote["birInvoice"], string> = {
  vat: "VAT invoice",
  non_vat: "Non-VAT invoice",
  none: "No official invoice",
};

const NOT_PROVIDED = <span className="text-muted-foreground italic">Not provided</span>;

const fee = (centavos: number | null) => (centavos === null ? NOT_PROVIDED : php(centavos));

type Line = { label: string; cell: (r: Compared) => ReactNode; tint?: (r: Compared) => boolean };

/** Side-by-side quote comparison at the buyer's quantity. Display only; money maths lives in lib/quotes.ts. */
export function QuoteComparison({ rfq, quotes, today }: { rfq: Rfq; quotes: Quote[]; today: string }) {
  const rows = compareQuotes(quotes, rfq.quantity);

  const lines: Line[] = [
    { label: "Unit price at your quantity", cell: (r) => `${php(r.unitPriceCentavos)} / ${rfq.unit}` },
    {
      label: "Price tiers",
      cell: ({ quote: q }) =>
        q.priceTiers.length ? (
          <ul>
            <li>Any qty: {php(q.unitPriceCentavos)}</li>
            {q.priceTiers.map((t) => (
              <li key={t.minQty}>
                {qty(t.minQty)}+: {php(t.unitPriceCentavos)}
              </li>
            ))}
          </ul>
        ) : (
          "None"
        ),
    },
    { label: "Subtotal", cell: (r) => php(r.subtotalCentavos) },
    { label: "Setup fee", cell: (r) => fee(r.quote.setupFeeCentavos) },
    { label: "Shipping fee", cell: (r) => fee(r.quote.shippingFeeCentavos) },
    { label: "Tax", cell: (r) => fee(r.quote.taxCentavos) },
    {
      label: "Estimated total",
      tint: (r) => r.lowestTotal,
      cell: (r) => (
        <div className="flex flex-col items-start gap-1">
          <strong className="font-bold">{php(r.totalCentavos)}</strong>
          {r.missing.length > 0 && <span className="text-xs text-muted-foreground">+ fees not provided</span>}
          {r.lowestTotal && <Badge variant="secondary">Lowest total</Badge>}
        </div>
      ),
    },
    {
      label: "Lead time",
      tint: (r) => r.fastest,
      cell: (r) => (
        <div className="flex flex-col items-start gap-1">
          <span>{r.quote.leadDays} days</span>
          {r.fastest && <Badge variant="secondary">Fastest</Badge>}
        </div>
      ),
    },
    {
      label: "Delivery",
      cell: ({ quote: q }) => (
        <>
          {DELIVERY[q.deliveryTerms]}
          {rfq.deliveryPreference !== "any" && rfq.deliveryPreference !== q.deliveryTerms && (
            <span className="text-muted-foreground"> (you asked for {DELIVERY[rfq.deliveryPreference]})</span>
          )}
        </>
      ),
    },
    {
      label: "BIR invoice",
      cell: ({ quote: q }) =>
        rfq.needsBirInvoice && q.birInvoice === "none" ? (
          <span className="text-destructive">{BIR[q.birInvoice]} (you need one)</span>
        ) : (
          BIR[q.birInvoice]
        ),
    },
    { label: "Payment terms", cell: (r) => r.quote.paymentTerms },
    {
      label: "Valid until",
      cell: ({ quote: q }) => (
        <div className="flex flex-col items-start gap-1">
          <span>{date(q.validUntil)}</span>
          {q.validUntil < today && <Badge variant="destructive">Expired</Badge>}
        </div>
      ),
    },
  ];

  return (
    <Table>
      <TableCaption className="mt-0 mb-3 text-left">
        Compared at your quantity: {qty(rfq.quantity)} {rfq.unit}. Totals are estimates; the supplier&apos;s final
        invoice governs.
      </TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead scope="col" className="sticky left-0 bg-card">
            <span className="sr-only">Quotation detail</span>
          </TableHead>
          {rows.map(({ quote: q }) => {
            const supplier = supplierById(q.supplierId);
            return (
              <TableHead key={q.id} scope="col" className="h-auto py-2 align-top whitespace-normal">
                <div className="flex flex-col items-start gap-0.5">
                  <span>{supplier?.businessName ?? "Assigned supplier"}</span>
                  {supplier?.status === "approved" && <ApprovedBadge />}
                  <span className="text-xs font-normal text-muted-foreground">
                    Quote {q.ref} rev {q.revision}
                  </span>
                </div>
              </TableHead>
            );
          })}
        </TableRow>
      </TableHeader>
      <TableBody>
        {lines.map((line) => (
          <TableRow key={line.label}>
            <TableHead scope="row" className="sticky left-0 bg-card">
              {line.label}
            </TableHead>
            {rows.map((r) => (
              <TableCell key={r.quote.id} className={cn("align-top whitespace-normal", line.tint?.(r) && "bg-success/10")}>
                {line.cell(r)}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
