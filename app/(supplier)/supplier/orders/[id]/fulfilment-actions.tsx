"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Field, NativeSelect, useServerAction, useServerForm } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { bookShipment, markDelivered, markShipped, recordManualShipment, reportShipmentUpdate, startProduction } from "@/lib/actions/delivery";
import { php } from "@/lib/format";
import { COURIERS, MANUAL_CARRIERS } from "@/lib/shipping/couriers";
import type { Order } from "@/lib/types";
import { manualShipmentSchema } from "@/lib/validation/forms";

/** Courier and tracking number the supplier enters for its own courier. The database checks the order step. */
function ManualShipmentForm({ orderId }: { orderId: string }) {
  const [carrier, setCarrier] = useState<string>("");
  const { errors, onSubmit, pending } = useServerForm(
    manualShipmentSchema,
    (raw) => recordManualShipment(orderId, raw),
    "Tracking saved",
  );
  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4 sm:grid-cols-2">
      <Field label="Courier" name="carrier" errors={errors}>
        <NativeSelect id="carrier" name="carrier" value={carrier} onChange={(e) => setCarrier(e.target.value)}>
          <option value="">Choose a courier</option>
          {MANUAL_CARRIERS.map((id) => (
            <option key={id} value={id}>
              {COURIERS[id].label}
            </option>
          ))}
        </NativeSelect>
      </Field>
      {carrier === "other" && (
        <Field label="Courier name" name="carrierName" errors={errors}>
          <Input id="carrierName" name="carrierName" maxLength={60} />
        </Field>
      )}
      <Field label="Tracking number" name="trackingRef" errors={errors} className="sm:col-span-2">
        <Input id="trackingRef" name="trackingRef" maxLength={100} />
      </Field>
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending}>
          Save Tracking
        </Button>
      </div>
    </form>
  );
}

/** Shows only the next valid step. The database checks every step again; this only picks the button. */
export function FulfilmentActions({ order, testCourier = false }: { order: Omit<Order, "buyer">; testCourier?: boolean }) {
  const { run, pending } = useServerAction();
  const id = order.id;
  const paid = order.status === "paid" || order.status === "confirmed";
  const ready = order.status === "in_production" || (paid && !order.custom);
  // Stock (non-custom) orders skip production and go straight to shipping.
  const canStart = paid && order.custom && order.proofApprovedAt !== null;
  const courier = order.fulfilmentMode === "courier";
  const pickup = order.fulfilmentMode === "buyer_pickup";

  if (courier && order.shipment) {
    if (order.shipment.manual) {
      if (order.status !== "shipped") return null;
      if (order.deliveryClaimedAt) return <p className="text-sm text-muted-foreground">Waiting for the buyer to confirm.</p>;
      return (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={pending} onClick={() => run(() => reportShipmentUpdate(id, "in_transit"), "Status updated")}>
              In Transit
            </Button>
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => run(() => reportShipmentUpdate(id, "out_for_delivery"), "Status updated")}
            >
              Out for Delivery
            </Button>
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => run(() => reportShipmentUpdate(id, "failed_attempt"), "Status updated")}
            >
              Delivery Failed
            </Button>
            <Button disabled={pending} onClick={() => run(() => markDelivered(id), "Marked delivered")}>
              Mark Delivered
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">If the parcel comes back to you, contact TULAY support to record the return.</p>
        </div>
      );
    }
    // shortcut: until Ninja Van is connected, the fake courier page stands in for tracking updates.
    return order.shipment.carrier === "fake" ? (
      <Link href={`/ship/fake/${order.shipment.trackingRef}`} className="text-sm font-medium text-primary underline">
        Open the test courier page
      </Link>
    ) : null;
  }

  if (canStart) {
    return (
      <Button disabled={pending} onClick={() => run(() => startProduction(id), "Production started")}>
        Start production
      </Button>
    );
  }

  if (courier) {
    if (!ready) return null;
    return (
      <div className="flex flex-col gap-4">
        <div>
          <h3 className="mb-3 font-semibold">Enter Courier and Tracking Number</h3>
          <ManualShipmentForm orderId={id} />
        </div>
        {testCourier && (
          <Button variant="outline" disabled={pending} onClick={() => run(() => bookShipment(id), "Courier pickup booked")}>
            Book Test Courier
          </Button>
        )}
      </div>
    );
  }

  if (ready) {
    return (
      <Button
        disabled={pending}
        onClick={() => run(() => markShipped(id), pickup ? "Marked ready for pickup" : "Marked as handed over")}
      >
        {pickup ? "Mark ready for pickup" : "Mark as handed over"}
      </Button>
    );
  }

  if (order.status === "shipped") {
    if (order.deliveryClaimedAt) {
      return <p className="text-sm text-muted-foreground">Waiting for the buyer to confirm.</p>;
    }
    return (
      <Button disabled={pending} onClick={() => run(() => markDelivered(id), pickup ? "Marked picked up" : "Marked delivered")}>
        {pickup ? "Mark picked up" : "Mark delivered"}
      </Button>
    );
  }

  return null;
}

/** What the supplier hands the courier: ship-to address, amount to collect, and the order ref to write on the parcel. Display only. */
export function HandoverCard({ order }: { order: Omit<Order, "buyer"> }) {
  const shipTo = order.shipTo;
  const address = shipTo
    ? [shipTo.recipient, shipTo.phone, shipTo.line1, shipTo.line2, shipTo.barangay, shipTo.city, shipTo.province, shipTo.postalCode]
        .filter(Boolean)
        .join(", ")
    : "";
  const cod = order.paymentOption === "cod";

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(address);
      toast.success("Address copied");
    } catch {
      toast.error("Could not copy. Select the address and copy it by hand.");
    }
  }

  return (
    <section className="mb-6 rounded-lg border bg-card p-4">
      <h2 className="mb-3 font-semibold">Courier Handover</h2>
      <div className="flex flex-col gap-4 text-sm">
        <div className="flex flex-col gap-1">
          <p className="text-muted-foreground">Ship to</p>
          <p>{address || "No delivery address on this order."}</p>
          {address && (
            <Button variant="outline" size="sm" className="mt-1 self-start" onClick={copyAddress}>
              Copy Address
            </Button>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <p className="text-muted-foreground">Collect on delivery</p>
          {cod ? (
            <p className="text-title tabular-nums">{php(order.shipment?.codAmountCentavos ?? order.totalCentavos - order.paidOnlineCentavos)}</p>
          ) : (
            <p>Nothing to collect (paid online)</p>
          )}
        </div>
        <p>
          Write on the parcel: <strong>{order.ref}</strong>
        </p>
      </div>
    </section>
  );
}
