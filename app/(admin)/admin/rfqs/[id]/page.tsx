import { notFound } from "next/navigation";
import { RfqDetail } from "@/components/rfq-detail";
import { loadDeals } from "@/lib/data/deals";

export const metadata = { title: "RFQ details" };

// Admins see every submitted RFQ; drafts stay with the buyer.
export default async function AdminRfqPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, deals] = await Promise.all([params, loadDeals()]);
  const rfq = deals.rfqs.find((r) => r.id === id && r.status !== "draft");
  if (!rfq) notFound();
  return <RfqDetail rfq={rfq} role="admin" deals={deals} />;
}
