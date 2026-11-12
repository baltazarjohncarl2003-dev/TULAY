"use client";

import { useState } from "react";
import { Field, useServerAction } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { releasePayout } from "@/lib/actions/orders";

export function ReleasePayout({ payoutId }: { payoutId: string }) {
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
            <DialogDescription>Records that the money was sent to the supplier.</DialogDescription>
          </DialogHeader>
          <Field label="Transfer reference (optional)" name="reference">
            <Input
              id="reference"
              maxLength={200}
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
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
