import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Notice, Row, StatusPill } from "@/components/common";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { php } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { CourierButtons } from "./courier-buttons";

export const metadata = { title: "Test courier" };

export default function FakeCourierPage({ params }: { params: Promise<{ ref: string }> }) {
  return (
    <main className="flex flex-1 items-center justify-center bg-muted/30 p-4">
      <Suspense fallback={null}>
        <CourierBody params={params} />
      </Suspense>
    </main>
  );
}

/** Reads the route param and the session (the shipment is RLS-scoped), so it runs behind Suspense. */
async function CourierBody({ params }: { params: Promise<{ ref: string }> }) {
  const { ref: trackingRef } = await params;
  const { data: shipment } = await (await createClient())
    .from("shipments")
    .select("tracking_ref, status, cod_amount_centavos, carrier, orders(ref)")
    .eq("tracking_ref", trackingRef)
    .maybeSingle();
  if (!shipment || shipment.carrier !== "fake") notFound();

  return (
    <Card className="w-full max-w-lg">
      <CardHeader>
        <p className="text-sm font-bold tracking-tight text-primary">TULAY</p>
        <CardTitle>Test courier page</CardTitle>
        <CardDescription>Move the parcel through each step to test tracking.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Notice tone="warn">
          Test courier page — no real parcel moves. This stands in for Ninja Van until TULAY goes live.
        </Notice>

        <div className="flex flex-col divide-y">
          <Row k="Order" v={shipment.orders?.ref ?? "—"} />
          <Row k="Tracking ref" v={shipment.tracking_ref} />
          <Row k="Status" v={<StatusPill status={shipment.status} />} />
          <Row k="COD to collect" v={shipment.cod_amount_centavos > 0 ? php(shipment.cod_amount_centavos) : "None"} />
        </div>

        <CourierButtons trackingRef={shipment.tracking_ref} status={shipment.status} />
      </CardContent>
    </Card>
  );
}
