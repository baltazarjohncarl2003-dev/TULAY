"use client";

import { useServerAction } from "@/components/form";
import { Button } from "@/components/ui/button";
import { simulateTracking } from "@/lib/actions/delivery";

const STEPS = [
  { status: "picked_up", label: "Picked up" },
  { status: "in_transit", label: "In transit" },
  { status: "out_for_delivery", label: "Out for delivery" },
  { status: "delivered", label: "Delivered" },
  { status: "failed_attempt", label: "Failed attempt" },
  { status: "returned", label: "Returned to sender" },
] as const;

/** Fake courier only: one button per tracking step. Delivered and returned are final, so everything locks. */
export function CourierButtons({ trackingRef, status }: { trackingRef: string; status: string }) {
  const { run, pending } = useServerAction();
  const finished = status === "delivered" || status === "returned";
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {STEPS.map((s) => (
        <Button
          key={s.status}
          variant={s.status === "returned" ? "outline" : "default"}
          disabled={pending || finished}
          onClick={() => {
            if (s.status === "returned" && !window.confirm("Mark this parcel as returned to sender? This cannot be undone.")) return;
            run(() => simulateTracking(trackingRef, s.status), "Tracking updated");
          }}
        >
          {s.label}
        </Button>
      ))}
    </div>
  );
}
