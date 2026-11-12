import { notFound } from "next/navigation";
import { RfqDetail } from "@/components/rfq-detail";
import { loadDeals } from "@/lib/data/deals";
import { orderForSelection } from "@/lib/data/orders";

export const metadata = { title: "RFQ details" };

export default async function BuyerRfqPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, deals] = await Promise.all([params, loadDeals()]);
  const rfq = deals.rfqs.find((r) => r.id === id && r.buyerId === deals.viewer.userId);
  if (!rfq) notFound();
  const selection = deals.selections.find((s) => s.rfqId === rfq.id);
  const dealPayment = selection
    ? { order: await orderForSelection(selection.id), idempotencyKey: crypto.randomUUID() } // key after request data (Cache Components)
    : undefined;
  return <RfqDetail rfq={rfq} role="buyer" deals={deals} dealPayment={dealPayment} />;
}
