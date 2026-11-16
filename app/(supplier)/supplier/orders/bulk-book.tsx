"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { bookShipments, type BulkBookResult } from "@/lib/actions/delivery";

/** One click books every order that is ready to ship, then offers all their waybills in a new tab. */
export function BulkBook({ orders, courierLabel }: { orders: { id: string; ref: string }[]; courierLabel: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [results, setResults] = useState<(BulkBookResult & { ref: string })[] | null>(null);
  const refOf = (id: string) => orders.find((o) => o.id === id)?.ref ?? id;

  function book() {
    startTransition(async () => {
      const res = await bookShipments(orders.map((o) => o.id)).catch(() => null);
      if (!res) return void toast.error("Could not reach the server. Check your connection and try again.");
      if (!res.ok) return void toast.error(res.error);
      const booked = res.results.filter((r) => r.ok).length;
      if (booked) toast.success(`${booked} pickup${booked === 1 ? "" : "s"} booked`);
      if (booked < res.results.length) toast.error(`${res.results.length - booked} could not be booked`);
      setResults(res.results.map((r) => ({ ...r, ref: refOf(r.orderId) }))); // refs before the refresh drops booked rows
      router.refresh();
    });
  }

  const booked = results?.filter((r) => r.ok).map((r) => r.orderId) ?? [];
  const failed = results?.filter((r) => !r.ok) ?? [];

  return (
    <div className="mb-4 flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm">
          {orders.length
            ? `${orders.length} order${orders.length === 1 ? " is" : "s are"} ready to ship with ${courierLabel}.`
            : `No orders are waiting for a ${courierLabel} pickup.`}
        </p>
        <div className="flex flex-wrap gap-2">
          {booked.length > 0 && (
            <a
              href={`/ship/waybills?ids=${booked.join(",")}`}
              target="_blank"
              rel="noopener"
              className="inline-flex items-center text-sm font-medium text-primary underline"
            >
              Print {booked.length} Waybill{booked.length === 1 ? "" : "s"}
            </a>
          )}
          {orders.length > 0 && (
            <Button disabled={pending} onClick={book}>
              {pending ? "Booking..." : `Book ${orders.length} Pickup${orders.length === 1 ? "" : "s"}`}
            </Button>
          )}
        </div>
      </div>
      {failed.length > 0 && (
        <ul className="list-disc pl-5 text-sm text-destructive">
          {failed.map((r) => (
            <li key={r.orderId}>
              {r.ref}: {r.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
