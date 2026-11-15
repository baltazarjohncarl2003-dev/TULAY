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
import { dateTime, php } from "@/lib/format";

/** Rendered only when the server's cancel rules allow it. refundCentavos: what was paid online and not yet refunded. */
export function CancelOrder({ orderId, refundCentavos, deadline }: { orderId: string; refundCentavos: number; deadline: string | null }) {
  const { run, pending } = useServerAction();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  return (
    <>
      <div className="flex flex-col gap-1">
        <Button variant="outline" onClick={() => setOpen(true)}>
          Cancel order
        </Button>
        {deadline && <p className="text-xs text-muted-foreground">You can cancel until {dateTime(deadline)}.</p>}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Cancel this order?</DialogTitle>
            <DialogDescription>
              {refundCentavos > 0
                ? `You get ${php(refundCentavos)} back, the amount you paid online, to your original payment method.`
                : "Nothing was paid online, so there is nothing to refund."}{" "}
              {deadline
                ? `Custom orders can be cancelled until ${dateTime(deadline)}, or until you approve the proof if that comes first.`
                : "You can cancel until the supplier starts production."}
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
              onClick={() => run(() => cancelOrder(orderId, reason), refundCentavos > 0 ? "Order cancelled; refund sent" : "Order cancelled", () => setOpen(false))}
            >
              Cancel order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
