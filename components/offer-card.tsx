import { CheckCircle2Icon, HandshakeIcon, Undo2Icon, XCircleIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { dateTime, php } from "@/lib/format";
import { type ChatOffer, type OfferStatus, percentLabel } from "@/lib/offers";
import { cn } from "@/lib/utils";

function Row({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr] gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("min-w-0 break-words", className)}>{children}</dd>
    </div>
  );
}

const STATUS_LABEL: Record<OfferStatus, string> = {
  open: "Waiting for reply",
  countered: "Replaced by a counteroffer",
  accepted: "Accepted",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
  expired: "Expired",
};

/** A priced offer or counteroffer inside a chat. Buttons appear only for handlers that are passed. */
export function OfferCardView({
  offer,
  status,
  title,
  busy,
  onAccept,
  onReject,
  onCounter,
  onWithdraw,
}: {
  offer: ChatOffer;
  status: OfferStatus;
  title: string;
  busy: boolean;
  onAccept?: () => void;
  onReject?: () => void;
  onCounter?: () => void;
  onWithdraw?: () => void;
}) {
  const borderClass =
    status === "open" ? "border-l-primary" : status === "accepted" ? "border-l-green-600" : "border-l-muted-foreground";
  const pillClass =
    status === "open" ? "bg-accent text-primary" : status === "accepted" ? "bg-green-50 text-green-700" : "bg-muted text-muted-foreground";
  const superseded = status === "countered" || status === "withdrawn" || status === "rejected" || status === "expired";
  const figureClass = superseded ? "opacity-60" : undefined;

  return (
    <article
      aria-label="Offer"
      className={cn("w-full max-w-sm rounded-xl border border-l-4 bg-card p-4 text-sm shadow-sm", borderClass)}
    >
      <header className="flex items-center gap-2">
        <HandshakeIcon aria-hidden className="size-4 shrink-0 text-primary" />
        <h4 className="font-semibold">{title}</h4>
        <span className="ml-auto shrink-0 text-xs text-muted-foreground">Revision {offer.revision}</span>
      </header>
      <span className={cn("mt-2 inline-flex w-fit rounded-full px-2 py-0.5 text-xs font-medium", pillClass)}>
        {STATUS_LABEL[status]}
      </span>

      <dl className={cn("mt-3 grid gap-2", figureClass)}>
        <Row label="Product">
          {offer.productType ? `${offer.productName} · ${offer.productType}` : offer.productName}
        </Row>
        <Row label="Price per unit">{`${php(offer.unitPriceCentavos)} per ${offer.unit}`}</Row>
        <Row label="Quantity">{`${offer.quantity.toLocaleString("en-PH")} ${offer.unit}`}</Row>
        <Row label="Subtotal">{php(offer.subtotalCentavos)}</Row>
        <Row label="Shipping">{php(offer.shippingFeeCentavos)}</Row>
      </dl>

      <hr className="my-3 border-border" />

      <dl className={cn("grid gap-2", figureClass)}>
        <Row label="Total" className="text-base font-bold">{php(offer.totalCentavos)}</Row>
        <Row label="Downpayment">{`${percentLabel(offer.downpaymentBps)} · ${php(offer.downpaymentCentavos)}`}</Row>
        <Row label="Balance">{php(offer.totalCentavos - offer.downpaymentCentavos)}</Row>
        <Row label="Lead time">{`${offer.leadDays} days`}</Row>
        {!!offer.specs && <Row label="Specifications" className="whitespace-pre-line">{offer.specs}</Row>}
        {!!offer.paymentTerms && <Row label="Payment terms">{offer.paymentTerms}</Row>}
        {!!offer.conditions && <Row label="Conditions" className="whitespace-pre-line">{offer.conditions}</Row>}
        {status === "open" && <Row label="Valid until">{dateTime(offer.validUntil)}</Row>}
      </dl>

      {(onAccept || onCounter || onReject || onWithdraw) && (
        <div className="mt-4 flex flex-wrap gap-2">
          {onAccept && (
            <Button size="sm" disabled={busy} onClick={onAccept}>
              Accept offer
            </Button>
          )}
          {onCounter && (
            <Button size="sm" variant="outline" disabled={busy} onClick={onCounter}>
              Counter offer
            </Button>
          )}
          {onReject && (
            <Button size="sm" variant="ghost" disabled={busy} onClick={onReject}>
              Reject
            </Button>
          )}
          {onWithdraw && (
            <Button size="sm" variant="ghost" disabled={busy} onClick={onWithdraw}>
              Withdraw
            </Button>
          )}
        </div>
      )}
    </article>
  );
}

/** One line in the chat recording an answer (accept, reject or withdraw) to a proposal. */
export function OfferAnswerView({ answer, title }: { answer: ChatOffer; title: string }) {
  const accepted = answer.action === "accept";
  const Icon = accepted ? CheckCircle2Icon : answer.action === "reject" ? XCircleIcon : Undo2Icon;
  const priceLine = `${php(answer.unitPriceCentavos)} per ${answer.unit} × ${answer.quantity.toLocaleString("en-PH")} ${answer.unit}`;

  return (
    <article
      aria-label="Offer answer"
      className={cn(
        "w-full max-w-sm rounded-xl border p-3 text-sm",
        accepted ? "border-green-600 bg-green-50 text-green-800" : "bg-muted/50 text-muted-foreground",
      )}
    >
      <header className="flex items-center gap-2">
        <Icon aria-hidden className="size-4 shrink-0" />
        <h4 className="font-semibold">{title}</h4>
      </header>
      <p className="mt-1">
        {accepted
          ? `${priceLine} · Total ${php(answer.totalCentavos)} · Downpayment ${percentLabel(answer.downpaymentBps)} (${php(answer.downpaymentCentavos)})`
          : priceLine}
      </p>
      {accepted && <p className="mt-1 text-xs text-muted-foreground">These terms are locked.</p>}
    </article>
  );
}
