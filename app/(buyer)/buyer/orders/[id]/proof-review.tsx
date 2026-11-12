"use client";

import { useState } from "react";
import { z } from "zod";
import { useServerAction } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { respondProof } from "@/lib/actions/delivery";

const changesNote = z
  .string()
  .trim()
  .min(3, "Say what needs to change (at least 3 characters)")
  .max(1000, "Keep it under 1000 characters");

export function ProofReview({ proofId }: { proofId: string }) {
  const { run, pending } = useServerAction();
  const [checked, setChecked] = useState(false);
  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState<string | null>(null);

  function requestChanges() {
    const parsed = changesNote.safeParse(note);
    if (!parsed.success) {
      setNoteError(parsed.error.issues[0]?.message ?? "Say what needs to change");
      return;
    }
    setNoteError(null);
    run(() => respondProof(proofId, false, parsed.data), "Changes requested", () => setNote(""));
  }

  return (
    <div className="flex flex-col gap-4 rounded-md border p-3">
      <div className="flex flex-col gap-2">
        <label className="flex items-start gap-2">
          <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} className="mt-0.5" />
          <span>I checked the size, spelling and image quality. The approved proof is final and cancellation ends.</span>
        </label>
        <Button
          type="button"
          className="self-start"
          disabled={pending || !checked}
          onClick={() => run(() => respondProof(proofId, true), "Proof approved")}
        >
          Approve proof
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        <Textarea
          aria-label="What needs to change"
          placeholder="What needs to change?"
          maxLength={1000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        {noteError && (
          <p className="text-xs text-destructive" role="alert">
            {noteError}
          </p>
        )}
        <Button type="button" variant="outline" className="self-start" disabled={pending} onClick={requestChanges}>
          Request changes
        </Button>
      </div>
    </div>
  );
}
