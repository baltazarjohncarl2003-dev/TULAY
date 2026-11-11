"use client";

import { useState } from "react";
import { demoAction, Field, NativeSelect, useDemoForm } from "@/components/form";
import { Notice } from "@/components/common";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { date, php, quoteKnownTotal } from "@/lib/format";
import type { Quote } from "@/lib/types";
import { counterOfferSchema, messageSchema, selectSupplierSchema } from "@/lib/validation/forms";
import { cn } from "@/lib/utils";

type QuoteActionsProps = {
  quote: Quote;
  supplierName: string;
  minQuantity: number;
  canSelect: boolean;
  acceptOptions: { id: string; label: string }[];
};

/** Buyer actions on one quotation: counteroffer, and select supplier when its invite is accepted. */
export function QuoteActions({ quote, supplierName, minQuantity, canSelect, acceptOptions }: QuoteActionsProps) {
  const [counterOpen, setCounterOpen] = useState(false);
  const [selectOpen, setSelectOpen] = useState(false);
  const counter = useDemoForm(counterOfferSchema, "Counteroffer sent", () => setCounterOpen(false));
  const select = useDemoForm(selectSupplierSchema, "Supplier selection recorded", () => setSelectOpen(false));
  const knownTotal = quoteKnownTotal(quote).totalCentavos;

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" size="sm" onClick={() => setCounterOpen(true)}>
        Counteroffer
      </Button>
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
            <Field label="Proposed quantity" name="quantity" errors={counter.errors}>
              <Input id="quantity" name="quantity" type="number" min={minQuantity} defaultValue={quote.quantity} />
            </Field>
            <Field label="Unit price (PHP)" name="unitPrice" errors={counter.errors}>
              <Input
                id="unitPrice"
                name="unitPrice"
                inputMode="decimal"
                defaultValue={(quote.unitPriceCentavos / 100).toFixed(2)}
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
              <Button type="submit">Send counteroffer</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={selectOpen} onOpenChange={setSelectOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Confirm supplier selection</DialogTitle>
            <DialogDescription>
              Selecting a supplier records a procurement outcome. It does not transfer funds or legally execute a
              purchase order.
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
              <Button type="submit">Record supplier selection</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Accept / decline a counteroffer. Demo only: shows a toast. */
export function OfferResponse() {
  return (
    <div className="flex gap-2">
      <Button size="sm" onClick={() => demoAction("Counteroffer accepted")}>
        Accept
      </Button>
      <Button size="sm" variant="outline" onClick={() => demoAction("Counteroffer declined")}>
        Decline
      </Button>
    </div>
  );
}

export type ThreadMessage = { id: string; body: string; createdAt: string; mine: boolean; sender: string };
export type MessageThreadData = { supplierId: string; supplierName: string; messages: ThreadMessage[] };

/** Supplier conversations for one RFQ. composer: "send" shows the form, "closed" a notice, "none" read-only. */
export function MessageThread({
  threads,
  composer,
}: {
  threads: MessageThreadData[];
  composer: "send" | "closed" | "none";
}) {
  const [threadId, setThreadId] = useState(threads[0]?.supplierId ?? "");
  const { errors, onSubmit } = useDemoForm(messageSchema, "Message sent");
  const current = threads.find((t) => t.supplierId === threadId) ?? threads[0];
  if (!current) return null;

  return (
    <div className="flex flex-col gap-4">
      <Field label="Supplier conversation" name="thread">
        <NativeSelect
          id="thread"
          name="thread"
          value={current.supplierId}
          onChange={(e) => setThreadId(e.target.value)}
        >
          {threads.map((t) => (
            <option key={t.supplierId} value={t.supplierId}>
              {t.supplierName}
            </option>
          ))}
        </NativeSelect>
      </Field>

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
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-2">
          <Field label="Message" name="body" errors={errors}>
            <Textarea
              id="body"
              name="body"
              maxLength={2000}
              placeholder="Ask about specifications, turnaround, or quotation details…"
            />
          </Field>
          <div>
            <Button type="submit" size="sm">
              Send message
            </Button>
          </div>
        </form>
      )}
      {composer === "closed" && <Notice>Messaging is closed for this request.</Notice>}
    </div>
  );
}
