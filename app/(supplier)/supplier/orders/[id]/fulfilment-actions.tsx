"use client";

import Link from "next/link";
import { useServerAction } from "@/components/form";
import { Button } from "@/components/ui/button";
import { bookShipment, markDelivered, markShipped, startProduction } from "@/lib/actions/delivery";
import type { Order } from "@/lib/types";

/** Shows only the next valid step. The database checks every step again; this only picks the button. */
export function FulfilmentActions({ order }: { order: Omit<Order, "buyer"> }) {
  const { run, pending } = useServerAction();
  const id = order.id;
  const paid = order.status === "paid" || order.status === "confirmed";
  const ready = order.status === "in_production" || (paid && !order.custom);
  // Stock (non-custom) orders skip production and go straight to shipping.
  const canStart = paid && order.custom && order.proofApprovedAt !== null;
  const courier = order.fulfilmentMode === "courier";
  const pickup = order.fulfilmentMode === "buyer_pickup";

  if (courier && order.shipment) {
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
    return ready ? (
      <Button disabled={pending} onClick={() => run(() => bookShipment(id), "Courier pickup booked")}>
        Book courier pickup
      </Button>
    ) : null;
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
