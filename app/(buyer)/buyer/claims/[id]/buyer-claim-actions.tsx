"use client";

import { useState } from "react";
import { z } from "zod";
import { Field, useServerAction, useServerForm } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cancelClaim, escalateClaim, recordReturnShipment } from "@/lib/actions/claims";
import type { Claim } from "@/lib/types";

const noteSchema = z.object({ note: z.string().trim().max(1000, "Keep the note under 1000 characters") });
const trackingSchema = z.object({
  trackingRef: z.string().trim().min(3, "Enter the courier tracking reference").max(100, "Keep it under 100 characters"),
});

export function BuyerClaimActions({ claim, canEscalate }: { claim: Claim; canEscalate: boolean }) {
  const canWithdraw = claim.status === "open" || claim.status === "rejected";
  const awaitingReturn = claim.status === "awaiting_return" && claim.returnPayer === "buyer";
  if (!canEscalate && !canWithdraw && !awaitingReturn) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Next steps</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {awaitingReturn && <ReturnTracking claimId={claim.id} savedRef={claim.returnTrackingRef} />}
        <div className="flex flex-wrap gap-2">
          {canEscalate && <EscalateClaim claimId={claim.id} />}
          {canWithdraw && <WithdrawClaim claimId={claim.id} />}
        </div>
      </CardContent>
    </Card>
  );
}

function ReturnTracking({ claimId, savedRef }: { claimId: string; savedRef: string }) {
  const { errors, onSubmit, pending } = useServerForm(
    trackingSchema,
    (raw) => recordReturnShipment(claimId, String(raw.trackingRef ?? "")),
    "Return shipment saved",
  );
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      {savedRef && (
        <p className="text-sm">
          Saved tracking reference: <strong>{savedRef}</strong>
        </p>
      )}
      <Field label="Courier tracking reference for your return" name="trackingRef" errors={errors}>
        <Input id="trackingRef" name="trackingRef" defaultValue={savedRef} maxLength={100} />
      </Field>
      <div>
        <Button type="submit" disabled={pending}>
          Save
        </Button>
      </div>
    </form>
  );
}

function EscalateClaim({ claimId }: { claimId: string }) {
  const [open, setOpen] = useState(false);
  const { errors, onSubmit, pending } = useServerForm(
    noteSchema,
    (raw) => escalateClaim(claimId, String(raw.note ?? "")),
    "Sent to TULAY for review",
    () => setOpen(false),
  );
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Ask TULAY to review
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>Ask TULAY to review this claim?</DialogTitle>
              <DialogDescription>TULAY support will decide the claim. Add anything they should know (optional).</DialogDescription>
            </DialogHeader>
            <Field label="Note for TULAY" name="note" errors={errors}>
              <Textarea id="note" name="note" maxLength={1000} />
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Back
              </Button>
              <Button type="submit" disabled={pending}>
                Send to TULAY
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function WithdrawClaim({ claimId }: { claimId: string }) {
  const { run, pending } = useServerAction();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Withdraw claim
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Withdraw this claim?</DialogTitle>
            <DialogDescription>The claim will be closed. Nothing is refunded or returned for it.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Keep claim
            </Button>
            <Button
              type="button"
              disabled={pending}
              onClick={() => run(() => cancelClaim(claimId), "Claim withdrawn", () => setOpen(false))}
            >
              Withdraw
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
