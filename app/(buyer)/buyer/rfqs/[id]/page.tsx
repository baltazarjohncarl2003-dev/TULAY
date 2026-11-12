import { notFound } from "next/navigation";
import { RfqDetail } from "@/components/rfq-detail";
import { loadDeals } from "@/lib/data/deals";

export const metadata = { title: "RFQ details" };

export default async function BuyerRfqPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, deals] = await Promise.all([params, loadDeals()]);
  const rfq = deals.rfqs.find((r) => r.id === id && r.buyerId === deals.viewer.userId);
  if (!rfq) notFound();
  return <RfqDetail rfq={rfq} role="buyer" deals={deals} />;
}
