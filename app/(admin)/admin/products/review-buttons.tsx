"use client";

import { useState } from "react";
import { useServerAction } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { reviewProduct } from "@/lib/actions/catalog";

export function ReviewButtons({ productId }: { productId: string }) {
  const { run, pending } = useServerAction();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);

  function approve() {
    run(() => reviewProduct({ productId, status: "approved", reason: "" }), "Listing approved");
  }

  function openReject() {
    setReason("");
    setReasonError(null);
    setOpen(true);
  }

  function confirmReject() {
    if (reason.trim().length < 3) {
      setReasonError("Give a reason (at least 3 characters)");
      return;
    }
    setReasonError(null);
    run(
      () => reviewProduct({ productId, status: "rejected", reason: reason.trim() }),
      "Listing rejected",
      () => setOpen(false),
    );
  }

  return (
    <>
      <div className="flex gap-2">
        <Button size="sm" disabled={pending} onClick={approve}>
          Approve
        </Button>
        <Button size="sm" variant="outline" disabled={pending} onClick={openReject}>
          Reject
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Reject listing</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Textarea
              id="reason"
              name="reason"
              aria-label="Reason"
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              aria-invalid={reasonError ? true : undefined}
            />
            {reasonError && (
              <p className="text-xs text-destructive" role="alert">
                {reasonError}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" variant="outline" disabled={pending} onClick={confirmReject}>
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
