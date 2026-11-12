"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { useServerAction } from "@/components/form";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { inviteSuppliers, reviewRfq } from "@/lib/actions/deals";
import { categoryName } from "@/lib/categories";
import type { RfqStatus, Supplier } from "@/lib/types";
import { assignSuppliersSchema } from "@/lib/validation/forms";

type NoteDecision = "needs_information" | "reject";

const NOTE_COPY: Record<NoteDecision, { title: string; confirm: string; success: string }> = {
  needs_information: {
    title: "Ask the buyer for more information",
    confirm: "Send request",
    success: "Asked the buyer for more information",
  },
  reject: { title: "Reject RFQ", confirm: "Reject", success: "RFQ rejected" },
};

export function RfqQueueActions({
  rfqId,
  status,
  invitedSupplierIds,
  suppliers,
  showView,
}: {
  rfqId: string;
  status: RfqStatus;
  invitedSupplierIds: string[];
  suppliers: Supplier[];
  showView?: boolean;
}) {
  const { run, pending } = useServerAction();
  const [matchOpen, setMatchOpen] = useState(false);
  const [noteDecision, setNoteDecision] = useState<NoteDecision | null>(null);
  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState<string | null>(null);

  function approve() {
    run(() => reviewRfq({ rfqId, decision: "approve", note: "" }), "RFQ approved");
  }

  function openNote(decision: NoteDecision) {
    setNote("");
    setNoteError(null);
    setNoteDecision(decision);
  }

  function confirmNote() {
    if (!noteDecision) return;
    if (note.trim().length < 3) {
      setNoteError("Give a note (at least 3 characters)");
      return;
    }
    setNoteError(null);
    const decision = noteDecision;
    run(() => reviewRfq({ rfqId, decision, note: note.trim() }), NOTE_COPY[decision].success, () =>
      setNoteDecision(null),
    );
  }

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
    run(() => inviteSuppliers(rfqId, result.data), "Invitations sent", () => setMatchOpen(false));
  }

  const canMatchManually = status === "matching" || status === "invited" || status === "quoting";

  return (
    <>
      {showView !== false && (
        <Link href={`/admin/rfqs/${rfqId}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
          View
        </Link>
      )}
      {status === "under_review" && (
        <>
          <Button size="sm" disabled={pending} onClick={approve}>
            Approve
          </Button>
          <Button size="sm" variant="outline" disabled={pending} onClick={() => openNote("needs_information")}>
            Needs information
          </Button>
          <Button size="sm" variant="outline" disabled={pending} onClick={() => openNote("reject")}>
            Reject
          </Button>
        </>
      )}
      {canMatchManually && (
        <Button size="sm" variant="outline" onClick={() => setMatchOpen(true)}>
          Manual match
        </Button>
      )}

      <Dialog open={noteDecision !== null} onOpenChange={(open) => !open && setNoteDecision(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{noteDecision && NOTE_COPY[noteDecision].title}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Textarea
              aria-label="Note"
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              aria-invalid={noteError ? true : undefined}
            />
            {noteError && (
              <p className="text-xs text-destructive" role="alert">
                {noteError}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setNoteDecision(null)}>
              Cancel
            </Button>
            <Button type="button" disabled={pending} onClick={confirmNote}>
              {noteDecision && NOTE_COPY[noteDecision].confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={matchOpen} onOpenChange={setMatchOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Assign suppliers</DialogTitle>
            <DialogDescription>
              Only admin-approved suppliers are eligible. Invitations are recorded for each RFQ.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onAssign} noValidate className="flex flex-col gap-4">
            <div className="flex max-h-[50vh] flex-col gap-2 overflow-y-auto">
              {suppliers.length === 0 && <p className="text-sm text-muted-foreground">Approve a supplier first.</p>}
              {suppliers.map((s) => {
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
              <Button type="button" variant="outline" onClick={() => setMatchOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={suppliers.length === 0 || pending}>
                Send RFQ invitations
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
