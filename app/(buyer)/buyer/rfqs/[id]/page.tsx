import { notFound } from "next/navigation";
import { RfqDetail } from "@/components/rfq-detail";
import { DEMO_USERS, RFQS } from "@/lib/demo/data";

export const metadata = { title: "RFQ details" };

export function generateStaticParams() {
  return RFQS.filter((r) => r.buyerId === DEMO_USERS.buyer.id).map((r) => ({ id: r.id }));
}

export default async function BuyerRfqPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rfq = RFQS.find((r) => r.id === id && r.buyerId === DEMO_USERS.buyer.id);
  if (!rfq) notFound();
  return <RfqDetail rfq={rfq} role="buyer" />;
}
