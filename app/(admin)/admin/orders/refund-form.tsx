"use client";

import { useState } from "react";
import { z } from "zod";
import { Field, useServerForm } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { adminRefund } from "@/lib/actions/orders";
import { php } from "@/lib/format";

// Browser check for feedback only; adminRefund validates again and the database caps the amount.
const schema = z.object({
  amount: z.string().trim().min(1, "Enter an amount"),
  reason: z.string().trim().min(3, "Give a reason").max(500, "Keep the reason under 500 characters"),
  idempotencyKey: z.string().uuid(),
});

/** Pesos text from integer centavos, without floats. */
function pesosText(c: number) {
  return `${Math.trunc(c / 100)}.${String(c % 100).padStart(2, "0")}`;
}

export function RefundForm({
  orderId,
  refundableCentavos,
  idempotencyKey,
}: {
  orderId: string;
  refundableCentavos: number;
  idempotencyKey: string;
}) {
  const [open, setOpen] = useState(false);
  // The server treats a reused key as the same refund, so a finished refund needs a fresh key for the next one.
  const [key, setKey] = useState(idempotencyKey);
  const { errors, onSubmit, pending } = useServerForm(
    schema,
    (raw) => adminRefund({ ...raw, orderId }),
    "Refund sent",
    () => {
      setOpen(false);
      setKey(crypto.randomUUID());
    },
  );

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Refund
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Refund order</DialogTitle>
            <DialogDescription>Up to {php(refundableCentavos)} can still be refunded.</DialogDescription>
          </DialogHeader>
          <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
            <input type="hidden" name="idempotencyKey" value={key} readOnly />
            <Field label="Amount (pesos)" name="amount" errors={errors} hint="For example 1250.00">
              <Input id="amount" name="amount" inputMode="decimal" defaultValue={pesosText(refundableCentavos)} />
            </Field>
            <Field label="Reason" name="reason" errors={errors}>
              <Textarea id="reason" name="reason" maxLength={500} rows={3} />
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                Send refund
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
