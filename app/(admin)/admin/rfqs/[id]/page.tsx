import { notFound } from "next/navigation";
import { RfqDetail } from "@/components/rfq-detail";
import { categoryName } from "@/lib/categories";
import { listSuppliers } from "@/lib/data/catalog";
import { loadDeals, suggestSuppliers } from "@/lib/data/deals";
import { RfqQueueActions } from "../rfq-queue-actions";

export const metadata = { title: "RFQ details" };

// Admins see every submitted RFQ; drafts stay with the buyer.
export default async function AdminRfqPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, deals, suppliers] = await Promise.all([params, loadDeals(), listSuppliers()]);
  const rfq = deals.rfqs.find((r) => r.id === id && r.status !== "draft");
  if (!rfq) notFound();

  const invitedSupplierIds = deals.invites.filter((i) => i.rfqId === rfq.id).map((i) => i.supplierId);
  const canMatch = rfq.status === "matching" || rfq.status === "invited" || rfq.status === "quoting";
  const suggested = canMatch ? await suggestSuppliers(rfq.id) : [];

  return (
    <>
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <RfqQueueActions
            rfqId={rfq.id}
            status={rfq.status}
            invitedSupplierIds={invitedSupplierIds}
            suppliers={suppliers}
            showView={false}
          />
        </div>
        {canMatch && (
          <div className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold">Suggested suppliers</h2>
            {suggested.length === 0 ? (
              <p className="text-sm text-muted-foreground">No suggestions.</p>
            ) : (
              <ul className="flex flex-col gap-2 text-sm">
                {suggested.map(({ supplier, score }) => (
                  <li key={supplier.id} className="flex flex-wrap justify-between gap-2 rounded-lg border p-3">
                    <span className="font-medium">{supplier.businessName}</span>
                    <span className="text-muted-foreground">
                      {categoryName(supplier.categorySlug)} · {supplier.province} · Score {score}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>
      <RfqDetail rfq={rfq} role="admin" deals={deals} />
    </>
  );
}
