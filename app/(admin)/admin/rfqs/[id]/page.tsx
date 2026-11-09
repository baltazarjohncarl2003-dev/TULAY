import { notFound } from "next/navigation";
import { RfqDetail } from "@/components/rfq-detail";
import { RFQS } from "@/lib/demo/data";

export const metadata = { title: "RFQ details" };

// Admins see every submitted RFQ; drafts stay with the buyer.
export function generateStaticParams() {
  return RFQS.filter((r) => r.status !== "draft").map((r) => ({ id: r.id }));
}

export default async function AdminRfqPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rfq = RFQS.find((r) => r.id === id && r.status !== "draft");
  if (!rfq) notFound();
  return <RfqDetail rfq={rfq} role="admin" />;
}
