import { notFound } from "next/navigation";
import { RfqDetail } from "@/components/rfq-detail";
import { DEMO_SUPPLIER, INVITES, RFQS } from "@/lib/demo/data";

export const metadata = { title: "RFQ details" };

const isInvited = (rfqId: string) => INVITES.some((i) => i.rfqId === rfqId && i.supplierId === DEMO_SUPPLIER.id);

export function generateStaticParams() {
  return RFQS.filter((r) => isInvited(r.id)).map((r) => ({ id: r.id }));
}

export default async function SupplierRfqPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rfq = RFQS.find((r) => r.id === id && isInvited(r.id));
  if (!rfq) notFound();
  return <RfqDetail rfq={rfq} role="supplier" />;
}
