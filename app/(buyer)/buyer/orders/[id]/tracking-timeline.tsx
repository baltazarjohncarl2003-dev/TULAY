"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { dateTime } from "@/lib/format";
import type { ShipmentStatus } from "@/lib/types";

const STEPS: { status: ShipmentStatus; label: string }[] = [
  { status: "booked", label: "Booked" },
  { status: "picked_up", label: "Picked Up" },
  { status: "in_transit", label: "In Transit" },
  { status: "out_for_delivery", label: "Out For Delivery" },
  { status: "delivered", label: "Delivered" },
];

/** Position in STEPS; -1 for statuses that are not a step (failed_attempt, returned). */
const rank = (s: ShipmentStatus) => STEPS.findIndex((step) => step.status === s);

/** Fixed delivery steps. A step is done when it or a later step has been reached. */
export function TrackingTimeline({
  status,
  events,
}: {
  status: ShipmentStatus;
  events: { status: ShipmentStatus; occurredAt: string }[];
}) {
  const reached = [status, ...events.map((e) => e.status)];
  return (
    <ol className="flex flex-col gap-2 border-t pt-3">
      {STEPS.map((step, i) => {
        const done = reached.some((s) => rank(s) >= i);
        // events are oldest first, so find() gives the first event that reached this step.
        const first = events.find((e) => rank(e.status) >= i);
        return (
          <li key={step.status} className="flex items-center justify-between gap-2">
            <span className={`flex items-center gap-2 ${done ? "" : "text-muted-foreground"}`}>
              <span
                aria-hidden
                className={`size-2.5 rounded-full ${done ? "bg-primary" : "border border-muted-foreground"}`}
              />
              {step.label}
              <span className="sr-only">{done ? "(done)" : "(not yet)"}</span>
            </span>
            {first && <span className="text-xs text-muted-foreground">{dateTime(first.occurredAt)}</span>}
          </li>
        );
      })}
    </ol>
  );
}

export function CopyTrackingNumber({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => navigator.clipboard.writeText(value).then(() => setCopied(true), () => setCopied(false))}
    >
      {copied ? "Copied" : "Copy tracking number"}
    </Button>
  );
}
