import { EmptyState, Notice, PageHeader, StatusPill } from "@/components/common";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { categoryName, SUPPLIERS } from "@/lib/demo/data";
import { qty } from "@/lib/format";
import { SupplierReviewButtons } from "./supplier-review-buttons";

export const metadata = { title: "Supplier review" };

// Pending applications first, then the rest in their original order.
const suppliers = [...SUPPLIERS].sort((a, b) => Number(b.status === "pending") - Number(a.status === "pending"));

export default function AdminSuppliersPage() {
  return (
    <>
      <PageHeader
        eyebrow="Trust operations"
        title="Supplier review"
        description="Approve only companies that meet your documented onboarding requirements."
      />

      <div className="mb-6">
        <Notice tone="warn">
          Document checks (DTI/SEC, BIR, IDs) and MFA for verifiers arrive with the backend.
        </Notice>
      </div>

      {suppliers.length === 0 ? (
        <EmptyState title="No supplier applications yet." />
      ) : (
        <div className="flex flex-col gap-4">
          {suppliers.map((s) => (
            <Card key={s.id}>
              <CardHeader>
                <CardTitle>{s.businessName}</CardTitle>
                <CardDescription>
                  {s.legalName} · {s.city}, {s.province}
                </CardDescription>
                <CardAction>
                  <StatusPill status={s.status} />
                </CardAction>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 text-sm">
                <p>{s.description}</p>
                <p className="text-muted-foreground">
                  Category: {categoryName(s.categorySlug)} · MOQ {qty(s.moq)} · Lead {s.leadDays} days
                </p>
                <p className="text-muted-foreground">Delivery areas: {s.deliveryAreas.join(", ")}</p>
              </CardContent>
              <CardFooter className="flex-wrap gap-2">
                <SupplierReviewButtons status={s.status} />
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
