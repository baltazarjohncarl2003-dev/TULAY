import { notFound } from "next/navigation";
import { RfqDetail } from "@/components/rfq-detail";
import { loadDeal } from "@/lib/data/deals";

export const metadata = { title: "RFQ Details" };

export default async function SupplierRfqPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const deals = await loadDeal(id);
  // RLS returns a request to a supplier only when they are invited to it.
  const invited = deals.invites.some((i) => i.rfqId === id && i.supplierId === deals.viewer.supplierId);
  const rfq = invited ? deals.rfqs.find((r) => r.id === id) : undefined;
  if (!rfq) notFound();
  return <RfqDetail rfq={rfq} role="supplier" deals={deals} />;
}
