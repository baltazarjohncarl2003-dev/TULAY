"use client";

import { useState } from "react";
import { z } from "zod";
import { useServerAction } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/lib/action-result";
import { adminRecordCourierBooking, adminReleaseCourierBooking, adminVoidShipment } from "@/lib/actions/delivery";

const reasonSchema = z.string().trim().min(3, "Give a reason (at least 3 characters)").max(500, "Keep the reason under 500 characters");

const recordSchema = z.object({
  trackingRef: z.string().trim().min(1, "Enter the Lalamove order ID").max(100, "Keep the ID under 100 characters"),
  price: z.string().trim().regex(/^\d+(\.\d{1,2})?$/, "Enter the booked price in pesos, like 124.50"),
  shareLink: z.union([z.literal(""), z.string().trim().max(500).startsWith("https://", "The link must start with https://")]),
});

/** Support records a booking seen in the Lalamove dashboard after an unknown result. The server validates again. */
function RecordBookingForm({ orderId }: { orderId: string }) {
  const { run, pending } = useServerAction();
  const [trackingRef, setTrackingRef] = useState("");
  const [price, setPrice] = useState("");
  const [shareLink, setShareLink] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit() {
    const parsed = recordSchema.safeParse({ trackingRef, price, shareLink });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the fields");
      return;
    }
    setError(null);
    run(() => adminRecordCourierBooking(orderId, parsed.data), "Courier booking recorded", () => {
      setTrackingRef("");
      setPrice("");
      setShareLink("");
    });
  }

  return (
    <div className="mt-4 flex flex-col gap-2 border-t pt-3">
      <h3 className="text-sm font-medium">Record courier booking</h3>
      <p className="text-sm text-muted-foreground">
        Use this only for a booking you can see in the Lalamove dashboard. If there is none, release the booking claim instead.
      </p>
      <label className="flex flex-col gap-1 text-sm">
        Lalamove order ID
        <Input maxLength={100} value={trackingRef} onChange={(e) => setTrackingRef(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Booked price (₱)
        <Input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Tracking link (optional)
        <Input maxLength={500} value={shareLink} onChange={(e) => setShareLink(e.target.value)} />
      </label>
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
      <div>
        <Button type="button" variant="outline" size="sm" disabled={pending} onClick={submit}>
          Record Courier Booking
        </Button>
      </div>
    </div>
  );
}

function ReasonForm({
  title,
  help,
  button,
  success,
  act,
}: {
  title: string;
  help: string;
  button: string;
  success: string;
  act: (reason: string) => Promise<ActionResult>;
}) {
  const { run, pending } = useServerAction();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit() {
    const parsed = reasonSchema.safeParse(reason);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Give a reason");
      return;
    }
    setError(null);
    run(() => act(parsed.data), success, () => setReason(""));
  }

  return (
    <div className="mt-4 flex flex-col gap-2 border-t pt-3">
      <h3 className="text-sm font-medium">{title}</h3>
      <p className="text-sm text-muted-foreground">{help}</p>
      <Textarea
        aria-label={`Reason: ${title}`}
        maxLength={500}
        value={reason}
        aria-invalid={error !== null}
        onChange={(e) => setReason(e.target.value)}
      />
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
      <div>
        <Button type="button" variant="outline" size="sm" disabled={pending} onClick={submit}>
          {button}
        </Button>
      </div>
    </div>
  );
}

/** Support-only courier controls. The server checks the role and the booking state again. */
export function CourierSupportForms({ orderId, canRelease,
  canVoid,
  canRecord,
}: {
  orderId: string;
  canRelease: boolean;
  canVoid: boolean;
  canRecord: boolean;
}) {
  return (
    <>
      {canRelease && (
        <ReasonForm
          title="Release booking claim"
          help="Only after checking the Lalamove dashboard that no booking exists for this order."
          button="Release Booking Claim"
          success="Booking claim released"
          act={(reason) => adminReleaseCourierBooking(orderId, reason)}
        />
      )}
      {canRecord && <RecordBookingForm orderId={orderId} />}
      {canVoid && (
        <ReasonForm
          title="Void courier booking"
          help="Marks the booking as voided so the supplier can book again. Cancel it in the Lalamove dashboard too."
          button="Void Courier Booking"
          success="Courier booking voided"
          act={(reason) => adminVoidShipment(orderId, reason)}
        />
      )}
    </>
  );
}
