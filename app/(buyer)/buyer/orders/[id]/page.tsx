import { notFound } from "next/navigation";
import { PageHeader, Row, StatusPill } from "@/components/common";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSessionUser } from "@/lib/auth";
import { getOrder } from "@/lib/data/orders";
import { date, label, php, qty } from "@/lib/format";
import { CancelOrder } from "./cancel-order";

export const metadata = { title: "Order details" };

export default async function BuyerOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [order, viewer] = await Promise.all([getOrder(id), getSessionUser()]);
  if (!order || order.buyerId !== viewer?.id) notFound();

  return (
    <>
      <PageHeader
        eyebrow={order.supplierName}
        title={order.ref}
        actions={<StatusPill status={order.status} />}
      />

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Items</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col divide-y">
                {order.items.map((item) => (
                  <li key={item.id} className="flex justify-between gap-4 py-3 text-sm">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium">{item.title}</span>
                      {item.variantName && <span className="text-muted-foreground">{item.variantName}</span>}
                      <span className="text-muted-foreground">
                        {qty(item.quantity)} {label(item.unit)} × {php(item.unitPriceCentavos)}
                      </span>
                    </div>
                    <strong className="tabular-nums">{php(item.lineTotalCentavos)}</strong>
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex flex-col divide-y border-t pt-2">
                <Row k="Items subtotal" v={php(order.itemsCentavos)} />
                {order.feesCentavos > 0 && <Row k="Quoted fees (setup, shipping, tax)" v={php(order.feesCentavos)} />}
                <Row k="Total" v={php(order.totalCentavos)} />
              </div>
            </CardContent>
          </Card>

          {order.refunds.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Refunds</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="flex flex-col divide-y text-sm">
                  {order.refunds.map((r) => (
                    <li key={r.id} className="flex flex-col gap-1 py-2">
                      <div className="flex items-center justify-between gap-4">
                        <strong className="tabular-nums">{php(r.amountCentavos)}</strong>
                        <StatusPill status={r.status} />
                      </div>
                      {r.reason && <span className="text-muted-foreground">{r.reason}</span>}
                      <span className="text-xs text-muted-foreground">{date(r.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Status</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="flex flex-col gap-3 text-sm">
                {order.history.map((h, i) => (
                  <li key={`${h.createdAt}-${i}`} className="flex flex-col gap-0.5">
                    <div className="flex items-center justify-between gap-2">
                      <StatusPill status={h.toStatus} />
                      <span className="text-xs text-muted-foreground">{date(h.createdAt)}</span>
                    </div>
                    {h.reason && <span className="text-muted-foreground">{h.reason}</span>}
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>

          {order.status === "paid" && <CancelOrder orderId={order.id} />}
        </div>
      </div>
    </>
  );
}
