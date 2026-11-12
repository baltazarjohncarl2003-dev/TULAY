"use client";

import { z } from "zod";
import { Field, useServerForm } from "@/components/form";
import { Button } from "@/components/ui/button";
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
const schema = z
  .object({
    outcome: z.enum(["refund", "replacement", "decline"], "Pick an outcome"),
    refund: z.string().trim(),
    returnRequired: z.literal("on").optional(),
    note: z.string().trim().min(3, "Explain the decision").max(1000, "Keep the note under 1000 characters"),
  })
  .superRefine((d, ctx) => {
    if (d.outcome !== "refund") return;
    try {
      if (!toCentavos(d.refund)) ctx.addIssue({ code: "custom", path: ["refund"], message: "Enter an amount" });
    } catch (e) {
      ctx.addIssue({ code: "custom", path: ["refund"], message: (e as Error).message });
    }
  });

export function DecideClaim({ claimId, refundableHintCentavos }: { claimId: string; refundableHintCentavos: number }) {
  const { errors, onSubmit, pending } = useServerForm(
    schema,
    // A checked box arrives as "on"; the server expects a boolean.
    (raw) => adminDecideClaim(claimId, { ...raw, returnRequired: raw.returnRequired === "on" }),
    "Decision recorded",
  );

  return (
    <section className="mb-6 flex flex-col gap-4 rounded-lg border p-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-semibold">Decide this claim</h2>
        <p className="text-sm text-muted-foreground">
          Your decision is sent to the buyer and the supplier. Declining is final on TULAY.
        </p>
      </div>

      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
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

        <Field label="Refund amount (pesos)" name="refund" errors={errors} hint={`Order total ${php(refundableHintCentavos)}`}>
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
    </section>
  );
}
