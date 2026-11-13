import { EmptyState, Notice, PageHeader, StatusPill } from "@/components/common";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { listSupplierApplications } from "@/lib/data/admin";
import { date, qty } from "@/lib/format";
import { SUPPLIER_DOCUMENT_KINDS } from "@/lib/validation/forms";
import { SupplierReviewButtons } from "./supplier-review-buttons";

export const metadata = { title: "Supplier review" };

export default async function AdminSuppliersPage() {
  const suppliers = await listSupplierApplications();
  return (
    <>
      <PageHeader
        eyebrow="Trust operations"
        title="Supplier review"
        description="Approve only companies that meet your documented onboarding requirements."
      />

      <div className="mb-6">
        <Notice tone="warn">
          Verify only companies whose documents match their application. Document links expire after 5 minutes; reload the
          page for fresh links. Every decision is logged.
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
                  Category: {s.categoryName} · MOQ {qty(s.moq)} · Lead {s.leadDays} days
                </p>
                <p className="text-muted-foreground">
                  Applicant: {s.ownerName || s.ownerEmail} ({s.ownerEmail}) · Submitted {date(s.submittedAt)}
                </p>
                <div className="flex flex-col gap-1">
                  <h3 className="font-medium">Documents</h3>
                  {s.documents.length === 0 ? (
                    <p className="text-muted-foreground">No documents uploaded yet.</p>
                  ) : (
                    <ul className="flex flex-col gap-1">
                      {s.documents.map((d) => (
                        <li key={d.id}>
                          {SUPPLIER_DOCUMENT_KINDS[d.kind]}:{" "}
                          {d.url ? (
                            <a href={d.url} target="_blank" rel="noreferrer" className="text-primary underline">
                              {d.fileName}
                            </a>
                          ) : (
                            <span>{d.fileName} (verifier role needed to open)</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </CardContent>
              <CardFooter className="flex-wrap gap-2">
                <SupplierReviewButtons supplierId={s.id} status={s.status} hasDocuments={s.documents.length > 0} />
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
