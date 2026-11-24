import { FileTextIcon } from "lucide-react";
import type { RfqCard } from "@/lib/chats";
import { date, php } from "@/lib/format";
import { cn } from "@/lib/utils";

function Row({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr] gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("min-w-0 break-words", className)}>{children}</dd>
    </div>
  );
}

/** A structured RFQ inside a chat. Read-only: offers come in a later stage. Alignment is set by the parent. */
export function RfqCardView({ rfq, mine }: { rfq: RfqCard; mine: boolean }) {
  return (
    <article aria-label="Request for quotation" className="w-full max-w-sm rounded-xl border bg-card p-4 text-sm shadow-sm">
      <header className="mb-3 flex items-center gap-2">
        <FileTextIcon aria-hidden className="size-4 shrink-0 text-primary" />
        <h4 className="font-semibold">Request for quotation</h4>
        <span className="ml-auto shrink-0 text-xs text-muted-foreground">{mine ? "Sent by you" : "From buyer"}</span>
      </header>

      <dl className="grid gap-2">
        <Row label="Product">{rfq.productName}</Row>
        {!!rfq.productType && <Row label="Type">{rfq.productType}</Row>}
        <Row label="Quantity">{`${rfq.quantity.toLocaleString("en-PH")} ${rfq.unit}`}</Row>
        {rfq.targetPriceCentavos !== null && (
          <Row label="Target price">{`${php(rfq.targetPriceCentavos)} per ${rfq.unit}`}</Row>
        )}
        {rfq.targetPriceCentavos !== null && (
          <Row label="Target total">{php(rfq.targetPriceCentavos * rfq.quantity)}</Row>
        )}
        {!!rfq.specs && <Row label="Specifications" className="whitespace-pre-line">{rfq.specs}</Row>}
        <Row label="Deliver to">{`${rfq.city}, ${rfq.province}`}</Row>
        {rfq.requiredBy !== null && <Row label="Needed by">{date(rfq.requiredBy)}</Row>}
        {!!rfq.notes && <Row label="Notes" className="whitespace-pre-line">{rfq.notes}</Row>}
      </dl>
    </article>
  );
}
