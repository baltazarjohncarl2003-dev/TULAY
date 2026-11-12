"use client";

import { useState } from "react";
import { z } from "zod";
import { useServerAction } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { adminHideReview } from "@/lib/actions/claims";

const reasonSchema = z.string().trim().min(3, "Give a reason (at least 3 characters)").max(500, "Keep the reason under 500 characters");

export function HideReview({ reviewId, hidden }: { reviewId: string; hidden: boolean }) {
  const { run, pending } = useServerAction();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);

  if (hidden) {
    return (
      <Button variant="outline" size="sm" disabled={pending} onClick={() => run(() => adminHideReview(reviewId, false), "Review unhidden")}>
        Unhide
      </Button>
    );
  }

  function openDialog() {
    setReason("");
    setReasonError(null);
    setOpen(true);
  }

  function confirmHide() {
    const parsed = reasonSchema.safeParse(reason);
    if (!parsed.success) {
      setReasonError(parsed.error.issues[0]?.message ?? "Give a reason");
      return;
    }
    setReasonError(null);
    run(() => adminHideReview(reviewId, true, parsed.data), "Review hidden", () => setOpen(false));
  }

  return (
    <>
      <Button variant="outline" size="sm" disabled={pending} onClick={openDialog}>
        Hide
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Hide this review?</DialogTitle>
            <DialogDescription>Hidden reviews are removed from supplier storefronts and product pages. Give a reason.</DialogDescription>
          </DialogHeader>
          <Textarea
            aria-label="Reason (required)"
            placeholder="Reason (required)"
            maxLength={500}
            value={reason}
            aria-invalid={reasonError !== null}
            onChange={(e) => setReason(e.target.value)}
          />
          {reasonError && (
            <p className="text-xs text-destructive" role="alert">
              {reasonError}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={pending} onClick={confirmHide}>
              Hide review
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
