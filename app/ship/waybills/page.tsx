import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getOrder } from "@/lib/data/orders";
import { mySupplierId } from "@/lib/data/supplier";
import { php, qty } from "@/lib/format";
import { carrierLabel } from "@/lib/shipping/couriers";
import { waybillCodes } from "@/lib/shipping/waybill";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Waybills", robots: { index: false } };

type Search = { searchParams: Promise<{ ids?: string }> };

// Printable A6 labels for the supplier's booked orders, one per page. Opened in a new tab from the orders pages.
export default function WaybillsPage({ searchParams }: Search) {
  return (
    <main className="mx-auto flex w-full flex-col items-center gap-6 bg-muted/30 p-4 print:gap-0 print:bg-white print:p-0">
      <style>{"@page { size: A6; margin: 0 } @media print { .waybill { break-after: page } }"}</style>
      <Suspense fallback={null}>
        <Waybills searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Waybills({ searchParams }: Search) {
  const { ids = "" } = await searchParams;
  const wanted = [...new Set(ids.split(",").filter((id) => /^[0-9a-f-]{36}$/i.test(id)))].slice(0, 50);
  const supplierId = await mySupplierId();
  if (!supplierId || wanted.length === 0) notFound();

  // RLS limits orders to the caller; the supplier check keeps one account's purchases out of its sales labels.
  const orders = (await Promise.all(wanted.map(getOrder))).filter(
    (o) => o && o.supplierId === supplierId && o.shipment && !o.shipment.manual && o.shipTo,
  );
  if (orders.length === 0) notFound();
  const { data: from } = await (await createClient()).from("supplier_pickup_settings").select("*").eq("supplier_id", supplierId).maybeSingle();

  return (
    <>
      <p className="text-sm text-muted-foreground print:hidden">
        {orders.length} waybill{orders.length === 1 ? "" : "s"}. Print on A6 labels (File, Print). Each label goes on its own parcel.
      </p>
      {orders.map((o) => {
        if (!o || !o.shipment || !o.shipTo) return null;
        const codes = waybillCodes(o.shipment.trackingRef);
        const to = o.shipTo;
        return (
          <section
            key={o.id}
            className="waybill flex w-[105mm] flex-col gap-2 border border-black bg-white p-3 text-[11px] leading-tight text-black print:h-[148mm] print:border-0"
          >
            <header className="flex items-center justify-between border-b border-black pb-1.5">
              <span className="text-base font-bold tracking-tight">TULAY</span>
              <span className="font-semibold">{carrierLabel(o.shipment.carrier, o.shipment.carrierName)}</span>
            </header>
            {codes ? (
              <div className="flex items-center gap-3">
                <div className="w-[26mm] shrink-0" dangerouslySetInnerHTML={{ __html: codes.qr }} />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div dangerouslySetInnerHTML={{ __html: codes.code128 }} />
                  <p className="text-center font-mono text-sm font-bold">{o.shipment.trackingRef}</p>
                </div>
              </div>
            ) : (
              <p className="font-mono text-sm font-bold">{o.shipment.trackingRef}</p>
            )}
            <div className="grid grid-cols-2 gap-2 border-y border-black py-1.5">
              <div>
                <p className="font-semibold uppercase">To</p>
                <p className="font-semibold">{to.recipient}</p>
                <p>{to.phone}</p>
                <p>{[to.line1, to.line2, to.barangay].filter(Boolean).join(", ")}</p>
                <p>{[to.city, to.province, to.postalCode].filter(Boolean).join(", ")}</p>
              </div>
              <div>
                <p className="font-semibold uppercase">From</p>
                {from ? (
                  <>
                    <p className="font-semibold">{from.sender_name}</p>
                    <p>{from.phone}</p>
                    <p>{[from.line1, from.line2, from.barangay].filter(Boolean).join(", ")}</p>
                    <p>{[from.city, from.province, from.postal_code].filter(Boolean).join(", ")}</p>
                  </>
                ) : (
                  <p className="font-semibold">{o.supplierName}</p>
                )}
              </div>
            </div>
            <p>
              <span className="font-semibold">Order:</span> {o.ref}
            </p>
            <p>
              <span className="font-semibold">Items:</span> {o.items.map((i) => `${i.title} × ${qty(i.quantity)}`).join(", ")}
            </p>
            <p className="mt-auto border-t border-black pt-1.5 text-sm font-bold">
              {o.shipment.codAmountCentavos > 0 ? `COD: collect ${php(o.shipment.codAmountCentavos)}` : "PREPAID: do not collect cash"}
            </p>
          </section>
        );
      })}
    </>
  );
}
