"use client";

import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { Field, useServerAction } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  confirmReturnReceived,
  markReplacementSent,
  recordManualRefund,
  recordReturnShipment,
  respondClaim,
} from "@/lib/actions/claims";
import { php, toCentavos } from "@/lib/format";
import type { Claim } from "@/lib/types";

// The server parses the peso text again; the database checks the refund cap and every rule.
function validPesos(v: string): boolean {
  try {
    return (toCentavos(v) ?? 0) > 0;
  } catch {
    return false;
  }
}

const acceptSchema = z
  .object({
    remedy: z.enum(["refund", "replacement"]),
    refund: z.string().trim(),
    returnRequired: z.boolean(),
    note: z.string().trim().max(1000, "Keep the note under 1000 characters"),
  })
  .refine((v) => v.remedy !== "refund" || validPesos(v.refund), {
    message: "Enter the refund amount in pesos, e.g. 1250.50",
    path: ["refund"],
  });
const rejectSchema = z.object({ note: z.string().trim().min(3, "Give the buyer a reason").max(1000, "Keep the reason under 1000 characters") });
const trackingSchema = z.object({ trackingRef: z.string().trim().min(3, "Enter the courier tracking reference").max(100) });
const referenceSchema = z.object({ reference: z.string().trim().min(3, "Enter the GCash or bank reference").max(200) });
const replacementSchema = z.object({ note: z.string().trim().max(500, "Keep the note under 500 characters") });

function check<S extends z.ZodType>(schema: S, value: unknown) {
  const r = schema.safeParse(value);
  if (!r.success) toast.error(r.error.issues[0].message);
  return r.success ? r.data : null;
}

/** Shows only the step the claim is waiting on. The database checks every step again. */
export function SupplierClaimActions({ claim }: { claim: Claim }) {
  const { run, pending } = useServerAction();
  const [remedy, setRemedy] = useState<"refund" | "replacement">("refund");
  const [refund, setRefund] = useState("");
  const [askBack, setAskBack] = useState(false);
  const [acceptNote, setAcceptNote] = useState("");
  const [rejectNote, setRejectNote] = useState("");
  const [trackingRef, setTrackingRef] = useState("");
  const [reference, setReference] = useState("");
  const [replacementNote, setReplacementNote] = useState("");
  const id = claim.id;
  // Change-of-mind returns always need the item back.
  const mustReturn = claim.type === "return";

  if (claim.status === "open") {
    function onAccept(e: React.FormEvent<HTMLFormElement>) {
      e.preventDefault();
      const v = check(acceptSchema, { remedy, refund, returnRequired: mustReturn || askBack, note: acceptNote });
      if (!v) return;
      run(() => respondClaim(id, { accept: true, ...v }), "Claim accepted");
    }
    function onReject(e: React.FormEvent<HTMLFormElement>) {
      e.preventDefault();
      const v = check(rejectSchema, { note: rejectNote });
      if (!v) return;
      run(() => respondClaim(id, { accept: false, note: v.note }), "Claim rejected");
    }
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Accept the claim</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={onAccept} noValidate className="flex flex-col gap-3">
              <fieldset className="flex flex-col gap-2 text-sm">
                <legend className="mb-1 font-medium">Remedy</legend>
                <label className="flex items-center gap-2">
                  <input type="radio" name="remedy" checked={remedy === "refund"} onChange={() => setRemedy("refund")} className="size-4" />
                  Refund
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="remedy"
                    checked={remedy === "replacement"}
                    onChange={() => setRemedy("replacement")}
                    className="size-4"
                  />
                  Replacement
                </label>
              </fieldset>
              {remedy === "refund" && (
                <Field label="Refund amount (PHP)" name="refund" hint="Up to what is still refundable on this order.">
                  <Input id="refund" name="refund" inputMode="decimal" placeholder="0.00" value={refund} onChange={(e) => setRefund(e.target.value)} />
                </Field>
              )}
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1 size-4"
                  checked={mustReturn || askBack}
                  disabled={mustReturn}
                  onChange={(e) => setAskBack(e.target.checked)}
                />
                <span>{mustReturn ? "Ask for the item back (required for change-of-mind returns)" : "Ask for the item back"}</span>
              </label>
              <Field label="Note to the buyer (optional)" name="accept-note">
                <Textarea id="accept-note" name="accept-note" value={acceptNote} onChange={(e) => setAcceptNote(e.target.value)} />
              </Field>
              <Button type="submit" disabled={pending} className="w-fit">
                Accept
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Reject the claim</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={onReject} noValidate className="flex flex-col gap-3">
              <Field label="Reason" name="reject-note" hint="The buyer sees this reason.">
                <Textarea id="reject-note" name="reject-note" value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} />
              </Field>
              <Button type="submit" variant="outline" disabled={pending} className="w-fit">
                Reject
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (claim.status === "awaiting_return") {
    function onShip(e: React.FormEvent<HTMLFormElement>) {
      e.preventDefault();
      const v = check(trackingSchema, { trackingRef });
      if (!v) return;
      run(() => recordReturnShipment(id, v.trackingRef), "Return tracking saved");
    }
    return (
      <Card>
        <CardHeader>
          <CardTitle>Return</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {claim.returnPayer === "supplier" && (
            <form onSubmit={onShip} noValidate className="flex flex-col gap-3">
              <Field label="Return tracking reference" name="tracking" hint="You book and pay the return courier. Enter its tracking reference.">
                <Input id="tracking" name="tracking" value={trackingRef} onChange={(e) => setTrackingRef(e.target.value)} />
              </Field>
              <Button type="submit" disabled={pending} className="w-fit">
                Save tracking reference
              </Button>
            </form>
          )}
          <div>
            <Button disabled={pending} onClick={() => run(() => confirmReturnReceived(id), "Return marked as received")}>
              Item received
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (claim.status === "refund_pending") {
    function onManualRefund(e: React.FormEvent<HTMLFormElement>) {
      e.preventDefault();
      const v = check(referenceSchema, { reference });
      if (!v) return;
      run(() => recordManualRefund(id, v.reference), "Refund recorded");
    }
    return (
      <Card>
        <CardHeader>
          <CardTitle>Pay the buyer back</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm">
            Send the buyer <strong>{php(claim.manualRefundCentavos)}</strong> directly (GCash or bank transfer), then record the reference.
          </p>
          <form onSubmit={onManualRefund} noValidate className="flex flex-col gap-3">
            <Field label="GCash or bank reference" name="reference" hint="The reference of the transfer you made.">
              <Input id="reference" name="reference" value={reference} onChange={(e) => setReference(e.target.value)} />
            </Field>
            <Button type="submit" disabled={pending} className="w-fit">
              Paid back directly
            </Button>
          </form>
        </CardContent>
      </Card>
    );
  }

  if (claim.status === "replacement_pending") {
    function onReplacement(e: React.FormEvent<HTMLFormElement>) {
      e.preventDefault();
      const v = check(replacementSchema, { note: replacementNote });
      if (!v) return;
      run(() => markReplacementSent(id, v.note), "Replacement marked as sent");
    }
    return (
      <Card>
        <CardHeader>
          <CardTitle>Replacement</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onReplacement} noValidate className="flex flex-col gap-3">
            <Field label="Note for the buyer (optional)" name="replacement-note" hint="For example the courier and tracking reference.">
              <Textarea id="replacement-note" name="replacement-note" value={replacementNote} onChange={(e) => setReplacementNote(e.target.value)} />
            </Field>
            <Button type="submit" disabled={pending} className="w-fit">
              Replacement sent
            </Button>
          </form>
        </CardContent>
      </Card>
    );
  }

  return null;
}
