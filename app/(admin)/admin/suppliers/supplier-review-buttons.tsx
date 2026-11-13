"use client";

import { useState } from "react";
import { useServerAction } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { setSupplierStatus } from "@/lib/actions/admin";
import type { AdminSupplierRow } from "@/lib/data/admin";

type ReasonStatus = "rejected" | "suspended" | "restricted";

const REASON_DIALOG: Record<ReasonStatus, { title: string; confirm: string; done: string }> = {
  rejected: { title: "Reject application", confirm: "Reject", done: "Supplier rejected" },
  suspended: { title: "Suspend supplier", confirm: "Suspend", done: "Supplier suspended" },
  restricted: { title: "Restrict supplier", confirm: "Restrict", done: "Supplier restricted" },
};

export function SupplierReviewButtons({
  supplierId,
  status,
  hasDocuments,
}: {
  supplierId: string;
  status: AdminSupplierRow["status"];
  hasDocuments: boolean;
}) {
  const { run, pending } = useServerAction();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<ReasonStatus>("rejected");
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);

  function changeStatus(next: "under_review" | "verified", message: string) {
    run(() => setSupplierStatus({ supplierId, status: next, reason: "" }), message);
  }

  function openReason(next: ReasonStatus) {
    setTarget(next);
    setReason("");
    setReasonError(null);
    setOpen(true);
  }

  function confirmReason() {
    if (reason.trim().length < 3) {
      setReasonError("Give a reason (at least 3 characters)");
      return;
    }
    setReasonError(null);
    run(() => setSupplierStatus({ supplierId, status: target, reason }), REASON_DIALOG[target].done, () => setOpen(false));
  }

  if (status === "rejected") {
    return <p className="text-sm text-muted-foreground">Waiting for the supplier to resubmit.</p>;
  }

  return (
    <>
      {status === "pending" && (
        <Button size="sm" disabled={pending} onClick={() => changeStatus("under_review", "Review started")}>
          Start review
        </Button>
      )}
      {(status === "pending" || status === "under_review") && (
        <Button
          size="sm"
          disabled={pending || !hasDocuments}
          onClick={() => changeStatus("verified", "Supplier verified")}
        >
          Verify
        </Button>
      )}
      {(status === "pending" || status === "under_review") && !hasDocuments && (
        <p className="text-xs text-muted-foreground">Verify needs the supplier&apos;s documents.</p>
      )}
      {(status === "restricted" || status === "suspended") && (
        <Button size="sm" disabled={pending} onClick={() => changeStatus("verified", "Supplier reactivated")}>
          Reactivate
        </Button>
      )}
      {(status === "pending" || status === "under_review") && (
        <Button size="sm" variant="destructive" disabled={pending} onClick={() => openReason("rejected")}>
          Reject
        </Button>
      )}
      {(status === "verified" || status === "restricted") && (
        <Button size="sm" variant="destructive" disabled={pending} onClick={() => openReason("suspended")}>
          Suspend
        </Button>
      )}
      {status === "verified" && (
        <Button size="sm" variant="destructive" disabled={pending} onClick={() => openReason("restricted")}>
          Restrict
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{REASON_DIALOG[target].title}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reason">Reason</Label>
            <Textarea
              id="reason"
              name="reason"
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
            <Button type="button" variant="destructive" disabled={pending} onClick={confirmReason}>
              {REASON_DIALOG[target].confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
