"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Field, NativeSelect, useServerAction, useServerForm } from "@/components/form";
import { Notice } from "@/components/common";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { answerCounter, cancelRfq, selectSupplier, sendCounter, sendRfqMessage } from "@/lib/actions/deals";
import { startDealCheckout } from "@/lib/actions/orders";
import { date, php, quoteKnownTotal } from "@/lib/format";
import type { Quote } from "@/lib/types";
import { counterOfferSchema, messageSchema, selectSupplierSchema } from "@/lib/validation/forms";
import { cn } from "@/lib/utils";

type QuoteActionsProps = {
  rfqId: string;
  quote: Quote;
  supplierName: string;
  minQuantity: number;
  canSelect: boolean;
  /** false while the buyer's own counteroffer waits for a reply. */
  canCounter: boolean;
  /** Accept rows on this quote: selecting on one records its agreed terms. */
  acceptOptions: { id: string; label: string }[];
};

/** Buyer actions on one quotation: counteroffer, and select supplier. The database re-checks everything. */
export function QuoteActions({ rfqId, quote, supplierName, minQuantity, canSelect, canCounter, acceptOptions }: QuoteActionsProps) {
  const [counterOpen, setCounterOpen] = useState(false);
  const [selectOpen, setSelectOpen] = useState(false);
  // A new key each time the dialog opens: a double submit sends one counteroffer.
  const [counterKey, setCounterKey] = useState("");
  const counter = useServerForm(counterOfferSchema, (raw) => sendCounter(rfqId, quote.supplierId, raw), "Counteroffer sent", () =>
    setCounterOpen(false),
  );
  const select = useServerForm(selectSupplierSchema, (raw) => selectSupplier(rfqId, quote.id, raw), "Supplier selection recorded", () =>
    setSelectOpen(false),
  );
  const knownTotal = quoteKnownTotal(quote).totalCentavos;

  return (
    <div className="flex flex-wrap gap-2">
      {canCounter ? (
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setCounterKey(crypto.randomUUID());
            setCounterOpen(true);
          }}
        >
          Counteroffer
        </Button>
      ) : (
        <p className="text-sm text-muted-foreground">Waiting for {supplierName} to answer your counteroffer.</p>
      )}
      {canSelect && (
        <Button size="sm" onClick={() => setSelectOpen(true)}>
          Select supplier
        </Button>
      )}

      <Dialog open={counterOpen} onOpenChange={setCounterOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Propose a counteroffer</DialogTitle>
            <DialogDescription>
              To {supplierName} on {quote.ref}. Prices are indicative until the supplier confirms.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={counter.onSubmit} noValidate className="grid gap-4 sm:grid-cols-2">
            <input type="hidden" name="idempotencyKey" value={counterKey} readOnly />
            <Field label="Proposed quantity" name="quantity" errors={counter.errors}>
              <Input id="quantity" name="quantity" type="number" min={minQuantity} defaultValue={quote.quantity} />
            </Field>
            <Field label="Unit price (PHP)" name="unitPrice" errors={counter.errors}>
              <Input
                id="unitPrice"
                name="unitPrice"
                inputMode="decimal"
                defaultValue={centavosToInput(quote.unitPriceCentavos)}
              />
            </Field>
            <Field label="Lead time (days)" name="leadDays" errors={counter.errors}>
              <Input id="leadDays" name="leadDays" type="number" min={1} defaultValue={quote.leadDays} />
            </Field>
            <Field label="Payment terms" name="paymentTerms" errors={counter.errors}>
              <Input id="paymentTerms" name="paymentTerms" maxLength={300} defaultValue={quote.paymentTerms} />
            </Field>
            <Field label="Negotiation note" name="message" errors={counter.errors} className="sm:col-span-2">
              <Textarea id="message" name="message" maxLength={1000} />
            </Field>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={counter.pending}>
                Send counteroffer
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={selectOpen} onOpenChange={setSelectOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Confirm supplier selection</DialogTitle>
            <DialogDescription>
              Selecting a supplier records a procurement outcome and shares your contact details with them. It does not
              transfer funds or legally execute a purchase order.
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm">
            <strong className="font-medium">Base quote:</strong> {php(knownTotal)} known costs.
          </p>
          <form onSubmit={select.onSubmit} noValidate className="flex flex-col gap-4">
            <Field label="Commercial terms to accept" name="acceptedOfferId" errors={select.errors}>
              <NativeSelect id="acceptedOfferId" name="acceptedOfferId" defaultValue="">
                <option value="">Original latest quotation</option>
                {acceptOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <div className="flex flex-col gap-1.5">
              <label className="flex items-start gap-2 text-sm">
                <input name="ack" type="checkbox" className="mt-0.5 size-4 accent-primary" />
                <span>I understand final fees, delivery and purchase terms must be separately confirmed.</span>
              </label>
              {select.errors.ack?.[0] && (
                <p className="text-xs text-destructive" role="alert">
                  {select.errors.ack[0]}
                </p>
              )}
            </div>
            <div>
              <Button type="submit" disabled={select.pending}>
                Record supplier selection
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Accept or decline the other side's open counteroffer. */
export function OfferResponse({ rfqId, supplierId, offerId }: { rfqId: string; supplierId: string; offerId: string }) {
  const { run, pending } = useServerAction();
  const answer = (accept: boolean) =>
    run(
      () => answerCounter({ rfqId, supplierId, offerId, accept, idempotencyKey: crypto.randomUUID() }),
      accept ? "Counteroffer accepted" : "Counteroffer declined",
    );
  return (
    <div className="flex gap-2">
      <Button size="sm" disabled={pending} onClick={() => answer(true)}>
        Accept
      </Button>
      <Button size="sm" variant="outline" disabled={pending} onClick={() => answer(false)}>
        Decline
      </Button>
    </div>
  );
}

/** Buyer: cancel an open request (invited suppliers are told). */
export function CancelRfqButton({ rfqId }: { rfqId: string }) {
  const { run, pending } = useServerAction();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Cancel request
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Cancel this request?</DialogTitle>
            <DialogDescription>Suppliers can no longer quote, and the request cannot be reopened.</DialogDescription>
          </DialogHeader>
          <Textarea aria-label="Reason (optional)" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Keep it open
            </Button>
            <Button type="button" disabled={pending} onClick={() => run(() => cancelRfq(rfqId, reason), "Request cancelled", () => setOpen(false))}>
              Cancel request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export type ThreadMessage = { id: string; body: string; createdAt: string; mine: boolean; sender: string };
export type MessageThreadData = { supplierId: string; supplierName: string; messages: ThreadMessage[] };

/** Supplier conversations for one RFQ. composer: "send" shows the form, "closed" a notice, "none" read-only. */
export function MessageThread({
  rfqId,
  threads,
  composer,
}: {
  rfqId: string;
  threads: MessageThreadData[];
  composer: "send" | "closed" | "none";
}) {
  const [threadId, setThreadId] = useState(threads[0]?.supplierId ?? "");
  const formRef = useRef<HTMLFormElement>(null);
  const current = threads.find((t) => t.supplierId === threadId) ?? threads[0];
  const { errors, onSubmit, pending } = useServerForm(
    messageSchema,
    (raw) => sendRfqMessage(rfqId, current?.supplierId ?? "", raw),
    "Message sent",
    () => formRef.current?.reset(),
  );
  if (!current) return null;

  return (
    <div className="flex flex-col gap-4">
      {threads.length > 1 && (
        <Field label="Supplier conversation" name="thread">
          <NativeSelect id="thread" name="thread" value={current.supplierId} onChange={(e) => setThreadId(e.target.value)}>
            {threads.map((t) => (
              <option key={t.supplierId} value={t.supplierId}>
                {t.supplierName}
              </option>
            ))}
          </NativeSelect>
        </Field>
      )}

      <div aria-live="polite" className="flex max-h-96 flex-col gap-3 overflow-y-auto rounded-lg border bg-background p-3">
        {current.messages.length ? (
          current.messages.map((m) => (
            <div
              key={m.id}
              className={cn(
                "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                m.mine ? "ml-auto bg-accent text-accent-foreground" : "mr-auto bg-muted",
              )}
            >
              <span className="block text-xs opacity-70">
                {m.sender} · {date(m.createdAt)}
              </span>
              <p className="whitespace-pre-line">{m.body}</p>
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">No messages in this conversation yet.</p>
        )}
      </div>

      {composer === "send" && (
        <form ref={formRef} onSubmit={onSubmit} noValidate className="flex flex-col gap-2">
          <Field label="Message" name="body" errors={errors}>
            <Textarea
              id="body"
              name="body"
              maxLength={2000}
              placeholder="Ask about specifications, turnaround, or quotation details…"
            />
          </Field>
          <div>
            <Button type="submit" size="sm" disabled={pending}>
              Send message
            </Button>
          </div>
        </form>
      )}
      {composer === "closed" && <Notice>Messaging is closed for this request.</Notice>}
    </div>
  );
}

/** Buyer: pay for the selected deal (one checkout per deal; the database rejects a second). */
export function DealCheckout({
  selectionId,
  idempotencyKey,
  addresses,
  pickup,
}: {
  selectionId: string;
  idempotencyKey: string;
  /** The buyer's address book (id + one-line label). */
  addresses: { id: string; text: string }[];
  /** Buyer collects from the supplier: no address needed. */
  pickup: boolean;
}) {
  const [method, setMethod] = useState<"card" | "ewallet" | "online_banking">("ewallet");
  const [addressId, setAddressId] = useState(addresses[0]?.id ?? "");
  const [pending, startTransition] = useTransition();
  function pay() {
    startTransition(async () => {
      const res = await startDealCheckout(selectionId, { method, idempotencyKey, addressId: pickup ? "" : addressId });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      window.location.assign(res.redirectUrl);
    });
  }
  const needsAddress = !pickup && !addressId;
  return (
    <div className="flex flex-wrap items-end gap-2">
      {pickup ? (
        <p className="text-sm text-muted-foreground">You collect this order from the supplier.</p>
      ) : addresses.length ? (
        <Field label="Deliver to" name="addressId">
          <NativeSelect id="addressId" name="addressId" value={addressId} onChange={(e) => setAddressId(e.target.value)}>
            {addresses.map((a) => (
              <option key={a.id} value={a.id}>
                {a.text}
              </option>
            ))}
          </NativeSelect>
        </Field>
      ) : (
        <p className="text-sm">
          Add a delivery address first:{" "}
          <a href="/buyer/addresses" className="text-primary underline">
            manage addresses
          </a>
        </p>
      )}
      <Field label="Pay with" name="method">
        <NativeSelect id="method" name="method" value={method} onChange={(e) => setMethod(e.target.value as typeof method)}>
          <option value="ewallet">GCash / Maya (e-wallet)</option>
          <option value="card">Card</option>
          <option value="online_banking">Online banking</option>
        </NativeSelect>
      </Field>
      <Button size="sm" disabled={pending || needsAddress} onClick={pay}>
        Proceed to payment
      </Button>
    </div>
  );
}
