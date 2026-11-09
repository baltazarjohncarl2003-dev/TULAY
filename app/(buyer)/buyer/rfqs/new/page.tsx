import { Suspense } from "react";
import { PageHeader } from "@/components/common";
import { CATEGORIES, DEMO_USERS, PRODUCTS, RFQS } from "@/lib/demo/data";
import { RfqForm } from "./rfq-form";

export const metadata = { title: "New RFQ" };

export default function NewRfqPage() {
  return (
    <>
      <PageHeader
        eyebrow="Buyer sourcing"
        title="Create request for quotation"
        description="Complete the core requirements. TULAY automatically invites opted-in, eligible suppliers. Unmatched requests go to admin assistance."
      />
      <Suspense fallback={null}>
        <RfqForm
          categories={CATEGORIES}
          products={PRODUCTS}
          rfqs={RFQS.filter((r) => r.buyerId === DEMO_USERS.buyer.id)}
        />
      </Suspense>
    </>
  );
}
