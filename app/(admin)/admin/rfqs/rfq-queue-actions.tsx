"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { demoAction } from "@/components/form";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { approvedSuppliers, categoryName } from "@/lib/demo/data";
import type { RfqStatus } from "@/lib/types";
import { assignSuppliersSchema } from "@/lib/validation/forms";

export function RfqQueueActions({
  rfqId,
  status,
  invitedSupplierIds,
}: {
  rfqId: string;
  status: RfqStatus;
  invitedSupplierIds: string[];
}) {
  const [open, setOpen] = useState(false);
  const eligible = approvedSuppliers();

  // Checkboxes with the same name arrive as an array, so getAll covers one or many picks.
  function onAssign(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const result = assignSuppliersSchema.safeParse({
      supplierIds: new FormData(e.currentTarget).getAll("supplierIds"),
    });
    if (!result.success) {
      toast.error(result.error.issues[0]?.message ?? "Check the supplier list.");
      return;
    }
    setOpen(false);
    toast.success("Invitations sent", { description: "Demo mode: not saved yet." });
  }

  const canMatchManually = status === "matching" || status === "invited" || status === "quoting";

  return (
    <>
      <Link href={`/admin/rfqs/${rfqId}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
        View
      </Link>
      {status === "under_review" && (
        <>
          <Button size="sm" onClick={() => demoAction("Matching approved")}>
            Approve matching
          </Button>
          <Button size="sm" variant="outline" onClick={() => demoAction("Marked as needs information")}>
            Needs information
          </Button>
        </>
      )}
      {canMatchManually && (
        <>
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            Manual match
          </Button>
          <Button size="sm" variant="outline" onClick={() => demoAction("Auto-matching re-run")}>
            Retry smart matching
          </Button>
        </>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Assign suppliers</DialogTitle>
            <DialogDescription>
              Only admin-approved suppliers are eligible. Invitations are recorded for each RFQ.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onAssign} noValidate className="flex flex-col gap-4">
            <div className="flex max-h-[50vh] flex-col gap-2 overflow-y-auto">
              {eligible.length === 0 && <p className="text-sm text-muted-foreground">Approve a supplier first.</p>}
              {eligible.map((s) => {
                const invited = invitedSupplierIds.includes(s.id);
                return (
                  <label key={s.id} className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm">
                    <input
                      type="checkbox"
                      name="supplierIds"
                      value={s.id}
                      defaultChecked={invited}
                      disabled={invited}
                      className="mt-0.5 size-4 accent-primary"
                    />
                    <span className="flex flex-col gap-0.5">
                      <strong className="font-medium">{s.businessName}</strong>
                      <span className="text-xs text-muted-foreground">
                        {categoryName(s.categorySlug)} · {s.city}
                      </span>
                      {invited && <span className="text-xs text-muted-foreground">Already invited</span>}
                    </span>
                  </label>
                );
              })}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={eligible.length === 0}>
                Send RFQ invitations
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
