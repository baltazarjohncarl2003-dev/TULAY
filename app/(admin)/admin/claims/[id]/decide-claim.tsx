"use client";

import { useRef, useState } from "react";
import { z } from "zod";
import { Field, useServerForm } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { adminDecideClaim } from "@/lib/actions/claims";
import { php, toCentavos } from "@/lib/format";

const OUTCOMES = [
  { value: "refund", text: "Refund" },
  { value: "replacement", text: "Replacement" },
  { value: "decline", text: "Decline" },
] as const;

// Browser check for feedback only; adminDecideClaim validates again, caps the refund and sends the gateway refund.
function makeSchema(claimableCentavos: number) {
  return z
    .object({
      outcome: z.enum(["refund", "replacement", "decline"], "Pick an outcome"),
      refund: z.string().trim(),
      returnRequired: z.literal("on").optional(),
      note: z.string().trim().min(3, "Explain the decision").max(1000, "Keep the note under 1000 characters"),
    })
    .superRefine((d, ctx) => {
      if (d.outcome !== "refund") return;
      try {
        const c = toCentavos(d.refund);
        if (!c) ctx.addIssue({ code: "custom", path: ["refund"], message: "Enter an amount" });
        else if (c > claimableCentavos) {
          ctx.addIssue({ code: "custom", path: ["refund"], message: `The most you can refund is ${php(claimableCentavos)}` });
        }
      } catch (e) {
        ctx.addIssue({ code: "custom", path: ["refund"], message: (e as Error).message });
      }
    });
}

export function DecideClaim({ claimId, claimableCentavos }: { claimId: string; claimableCentavos: number }) {
  const [schema] = useState(() => makeSchema(claimableCentavos));
  const formRef = useRef<HTMLFormElement>(null);
  const confirmed = useRef(false);
  const [summary, setSummary] = useState<{ outcome: string; amount: string; ret: boolean } | null>(null);
  const { errors, onSubmit, pending } = useServerForm(
    schema,
    // A checked box arrives as "on"; the server expects a boolean.
    (raw) => adminDecideClaim(claimId, { ...raw, returnRequired: raw.returnRequired === "on" }),
    "Decision recorded",
  );

  // The first submit only opens the confirm dialog; the dialog's button submits for real.
  function beforeSubmit(e: React.FormEvent<HTMLFormElement>) {
    if (confirmed.current) {
      confirmed.current = false;
      onSubmit(e);
      return;
    }
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const raw = Object.fromEntries(fd.entries());
    if (!schema.safeParse(raw).success) {
      onSubmit(e); // shows the field errors
      return;
    }
    const outcome = String(raw.outcome);
    const cents = outcome === "refund" ? toCentavos(String(raw.refund)) : null;
    setSummary({ outcome, amount: cents ? php(cents) : "", ret: raw.returnRequired === "on" });
  }

  function confirm() {
    setSummary(null);
    confirmed.current = true;
    formRef.current?.requestSubmit();
  }

  const outcomeText = OUTCOMES.find((o) => o.value === summary?.outcome)?.text ?? "";

  return (
    <section className="mb-6 flex flex-col gap-4 rounded-lg border p-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-semibold">Decide this claim</h2>
        <p className="text-sm text-muted-foreground">
          Your decision is sent to the buyer and the supplier. Declining is final on TULAY.
        </p>
      </div>

      <form ref={formRef} onSubmit={beforeSubmit} noValidate className="flex flex-col gap-4">
        <fieldset className="flex flex-col gap-2 text-sm">
          <legend className="mb-1 font-medium">Outcome</legend>
          {OUTCOMES.map((o) => (
            <label key={o.value} className="flex items-center gap-2">
              <input type="radio" name="outcome" value={o.value} className="size-4" />
              {o.text}
            </label>
          ))}
          {errors.outcome?.[0] && (
            <p className="text-xs text-destructive" role="alert">
              {errors.outcome[0]}
            </p>
          )}
        </fieldset>

        <Field label="Refund amount (pesos)" name="refund" errors={errors} hint={`Up to ${php(claimableCentavos)} can still be refunded on this order`}>
          <Input id="refund" name="refund" inputMode="decimal" placeholder="0.00" />
        </Field>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="returnRequired" className="size-4" />
          Ask for the item back
        </label>

        <Field label="Decision note" name="note" errors={errors} hint="Shown to the buyer and the supplier.">
          <Textarea id="note" name="note" rows={3} maxLength={1000} />
        </Field>

        <div>
          <Button type="submit" disabled={pending}>
            Submit decision
          </Button>
        </div>
      </form>

      <Dialog open={summary !== null} onOpenChange={(o) => !o && setSummary(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm decision</DialogTitle>
            <DialogDescription>
              {summary?.outcome === "refund" && `Refund ${summary.amount} to the buyer${summary.ret ? ", after the item comes back" : ""}. This cannot be undone.`}
              {summary?.outcome === "replacement" && "The supplier will be asked to send a replacement. This cannot be undone."}
              {summary?.outcome === "decline" && "Decline this claim. Declining is final on TULAY."}
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm">
            Outcome: <strong>{outcomeText}</strong>
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setSummary(null)}>
              Go back
            </Button>
            <Button type="button" disabled={pending} onClick={confirm}>
              Confirm {outcomeText.toLowerCase()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
