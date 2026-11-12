"use client";

import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { Field, useServerAction } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { setRestockingFee } from "@/lib/actions/claims";

/** Basis points to a percent string with integer math only ("250" -> "2.5", "200" -> "2"). */
function percentText(bps: number): string {
  const whole = Math.trunc(bps / 100);
  const frac = bps % 100;
  if (frac === 0) return String(whole);
  return frac % 10 === 0 ? `${whole}.${frac / 10}` : `${whole}.${String(frac).padStart(2, "0")}`;
}

/** Percent text to basis points, integer math only. Only call on text that passed the regex. */
function bpsOf(v: string): number {
  const [whole, frac = ""] = v.split(".");
  return Number(whole) * 100 + Number(frac.padEnd(2, "0"));
}

const percentSchema = (capBps: number) =>
  z
    .string()
    .trim()
    .regex(/^\d{1,3}(\.\d{1,2})?$/, "Use a percent like 2.5")
    .refine((v) => bpsOf(v) <= capBps, `Above TULAY's cap of ${percentText(capBps)}%`);

/** The supplier's restocking fee on change-of-mind returns. The database and the platform cap check it again. */
export function RestockingFee({ currentBps, capBps }: { currentBps: number; capBps: number }) {
  const { run, pending } = useServerAction();
  const [percent, setPercent] = useState(() => percentText(currentBps));

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsed = percentSchema(capBps).safeParse(percent);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    run(() => setRestockingFee(parsed.data), "Restocking fee saved");
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3 sm:max-w-sm">
      <Field label="Restocking fee (%)" name="percent" hint={`Up to ${percentText(capBps)}%.`}>
        <Input id="percent" name="percent" inputMode="decimal" value={percent} onChange={(e) => setPercent(e.target.value)} />
      </Field>
      <Button type="submit" disabled={pending} className="w-fit">
        Save restocking fee
      </Button>
    </form>
  );
}
