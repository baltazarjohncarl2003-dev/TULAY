import { notFound } from "next/navigation";
import { RfqDetail } from "@/components/rfq-detail";
import { loadDeals } from "@/lib/data/deals";

export const metadata = { title: "RFQ details" };

export default async function SupplierRfqPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, deals] = await Promise.all([params, loadDeals()]);
  // RLS returns a request to a supplier only when they are invited to it.
  const invited = deals.invites.some((i) => i.rfqId === id && i.supplierId === deals.viewer.supplierId);
  const rfq = invited ? deals.rfqs.find((r) => r.id === id) : undefined;
  if (!rfq) notFound();
  return <RfqDetail rfq={rfq} role="supplier" deals={deals} />;
}
