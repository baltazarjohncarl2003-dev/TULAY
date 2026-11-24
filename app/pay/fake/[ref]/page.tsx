import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Notice, Row, StatusPill } from "@/components/common";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getPaymentByRef } from "@/lib/data/orders";
import { label, php } from "@/lib/format";
import { PayButtons } from "./pay-buttons";

export const metadata = { title: "Test Payment" };

export default function FakePaymentPage({ params }: { params: Promise<{ ref: string }> }) {
  return (
    <main className="flex flex-1 items-center justify-center bg-muted/30 p-4">
      <Suspense fallback={null}>
        <PaymentBody params={params} />
      </Suspense>
    </main>
  );
}

/** Reads the route param and the session (the payment is RLS-scoped to its buyer), so it runs behind Suspense. */
async function PaymentBody({ params }: { params: Promise<{ ref: string }> }) {
  const { ref: providerRef } = await params;
  const payment = await getPaymentByRef(providerRef);
  if (!payment) notFound();
  const checkout = payment.checkouts;
  const orders = checkout?.orders ?? [];
  const balanceOf = checkout?.balance ?? null; // a balance payment covers part of an existing order

  return (
    <Card className="w-full max-w-lg">
      <CardHeader>
        <p className="text-sm font-bold tracking-tight text-primary">TULAY</p>
        <CardTitle>Test payment page</CardTitle>
        <CardDescription>Pay the amount below to confirm your order.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Notice tone="warn">
          Test payment page — no real money moves. This stands in for PayMongo until TULAY goes live.
        </Notice>

        <div className="flex flex-col divide-y">
          <Row k="Amount" v={php(payment.amount_centavos)} />
          <Row k="Method" v={label(payment.method)} />
          {checkout && <Row k="Expires" v={new Date(checkout.expires_at).toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" })} />}
          <Row k="Status" v={<StatusPill status={payment.status} />} />
        </div>

        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold">Covers</h2>
          <ul className="flex flex-col divide-y text-sm">
            {balanceOf && (
              <li className="flex justify-between gap-4 py-2">
                <span>
                  <span className="font-medium">{balanceOf.ref}</span>
                  <span className="text-muted-foreground"> · {balanceOf.suppliers?.business_name ?? "Supplier"} · balance</span>
                </span>
                <strong className="tabular-nums">{php(payment.amount_centavos)}</strong>
              </li>
            )}
            {orders.map((o) => (
              <li key={o.ref} className="flex justify-between gap-4 py-2">
                <span className="flex flex-col">
                  <span>
                    <span className="font-medium">{o.ref}</span>
                    <span className="text-muted-foreground"> · {o.suppliers?.business_name ?? "Supplier"}</span>
                  </span>
                  {o.payment_option !== "online" && (
                    <span className="text-xs text-muted-foreground">
                      Downpayment {php(o.downpayment_centavos)} of {php(o.total_centavos)};{" "}
                      {o.payment_option === "cod" ? "rest due on delivery" : "balance due online before shipping"}
                    </span>
                  )}
                </span>
                <strong className="tabular-nums">{php(o.payment_option === "online" ? o.total_centavos : o.downpayment_centavos)}</strong>
              </li>
            ))}
          </ul>
        </div>

        {payment.status === "pending" ? (
          <PayButtons providerRef={providerRef} />
        ) : (
          <Link href="/buyer/orders" className={buttonVariants({ variant: "outline" })}>
            Back to my orders
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
