"use client";

import { useState } from "react";
import { useServerAction } from "@/components/form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cancelOrder } from "@/lib/actions/orders";

export function CancelOrder({ orderId }: { orderId: string }) {
  const { run, pending } = useServerAction();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Cancel order
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Cancel this order?</DialogTitle>
            <DialogDescription>
              Cancelling refunds the full amount to your original payment method. You can cancel until the supplier starts
              production.
            </DialogDescription>
          </DialogHeader>
          <Textarea aria-label="Reason (optional)" placeholder="Reason (optional)" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Keep order
            </Button>
            <Button
              type="button"
              disabled={pending}
              onClick={() => run(() => cancelOrder(orderId, reason), "Order cancelled; refund sent", () => setOpen(false))}
            >
              Cancel order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
