"use client";

import { useState } from "react";
import { Field, useServerAction } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { releasePayout } from "@/lib/actions/orders";
import { php } from "@/lib/format";

export function ReleasePayout({
  payoutId,
  payoutRef,
  supplierName,
  amountCentavos,
  orderRefs,
  warnings,
}: {
  payoutId: string;
  payoutRef: string;
  supplierName: string;
  amountCentavos: number;
  orderRefs: string[];
  warnings: string[];
}) {
  const { run, pending } = useServerAction();
  const [open, setOpen] = useState(false);
  const [reference, setReference] = useState("");

  function confirm() {
    run(() => releasePayout(payoutId, reference.trim()), "Payout released", () => setOpen(false));
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Mark released
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Mark payout released</DialogTitle>
            <DialogDescription>
              Records that {php(amountCentavos)} ({payoutRef}) was sent to {supplierName}.
            </DialogDescription>
          </DialogHeader>
          {warnings.length > 0 && (
            <ul className="flex flex-col gap-1 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200" role="alert">
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
              <li>
                Check before sending {php(amountCentavos)} to {supplierName}.
              </li>
            </ul>
          )}
          <p className="text-sm text-muted-foreground">Orders: {orderRefs.length ? orderRefs.join(", ") : "none listed"}</p>
          <Field label="Transfer reference (optional)" name="reference">
            <Input id="reference" maxLength={200} value={reference} onChange={(e) => setReference(e.target.value)} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={pending} onClick={confirm}>
              Mark released
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
