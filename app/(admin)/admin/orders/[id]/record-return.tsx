"use client";

import { useState } from "react";
import { z } from "zod";
import { useServerAction } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { recordParcelReturned } from "@/lib/actions/delivery";

const noteSchema = z.string().trim().min(3, "Give a reason (at least 3 characters)").max(500, "Keep the reason under 500 characters");

/** Support records a parcel that came back from a manually tracked shipment. The database decides the refund. */
export function RecordReturn({ orderId }: { orderId: string }) {
  const { run, pending } = useServerAction();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit() {
    const parsed = noteSchema.safeParse(note);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Give a reason");
      return;
    }
    setError(null);
    run(() => recordParcelReturned(orderId, parsed.data), "Return recorded", () => setNote(""));
  }

  return (
    <div className="mt-4 flex flex-col gap-2 border-t pt-3">
      <p className="text-sm text-muted-foreground">Cancels the order. Stock orders are refunded; custom orders keep the online payment.</p>
      <Textarea
        aria-label="Reason for the returned parcel"
        placeholder="Reason (for example: returned to sender after two attempts)"
        maxLength={500}
        value={note}
        aria-invalid={error !== null}
        onChange={(e) => setNote(e.target.value)}
      />
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
      <div>
        <Button type="button" variant="outline" size="sm" disabled={pending} onClick={submit}>
          Record Returned Parcel
        </Button>
      </div>
    </div>
  );
}
