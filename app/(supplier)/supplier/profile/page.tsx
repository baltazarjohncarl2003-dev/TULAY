import { Notice, PageHeader, Row, StatusPill } from "@/components/common";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getMyApplication } from "@/lib/data/supplier";
import { categoryName } from "@/lib/demo/data";
import { date, label, qty } from "@/lib/format";
import { SUPPLIER_DOCUMENT_KINDS } from "@/lib/validation/forms";
import { DocumentUpload } from "./document-upload";
import { ProfileForm } from "./profile-form";

export const metadata = { title: "Company profile" };

export default async function SupplierProfilePage() {
  const app = await getMyApplication();
  return (
    <>
      <PageHeader
        eyebrow="Supplier onboarding"
        title="Company profile"
        description="Profiles are reviewed before suppliers can receive buyer RFQs."
        actions={app ? <StatusPill status={app.status} /> : undefined}
      />

      <div className="flex flex-col gap-6">
        {!app ? (
          <>
            <Notice>Tell us about your company. TULAY reviews every application before you can receive buyer RFQs.</Notice>
            <ProfileForm initial={null} />
          </>
        ) : app.status === "pending" || app.status === "rejected" ? (
          <>
            {app.status === "rejected" && app.history[0]?.toStatus === "rejected" && (
              <Notice tone="warn">
                Your application was not approved: {app.history[0]?.reason}. Update it and resubmit.
              </Notice>
            )}
            {app.status === "pending" && (
              <Notice>
                Submitted {date(app.submittedAt)}. You can still edit it while it waits for review.
              </Notice>
            )}
            <ProfileForm initial={app} />
          </>
        ) : (
          <>
            {app.status === "under_review" && <Notice>Your application is being reviewed.</Notice>}
            {app.status === "verified" && <Notice>Verified. For corrections, contact TULAY support.</Notice>}
            {(app.status === "suspended" || app.status === "restricted") && (
              <Notice tone="warn">
                Your supplier account is {label(app.status)}: {app.history[0]?.reason}. Contact TULAY support.
              </Notice>
            )}
            <Card>
              <CardHeader>
                <CardTitle>{app.businessName}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <p className="text-sm">{app.description}</p>
                <div className="flex flex-col">
                  <Row k="Legal name" v={app.legalName} />
                  <Row k="Category" v={categoryName(app.categorySlug)} />
                  <Row k="City, province" v={`${app.city}, ${app.province}`} />
                  <Row k="Minimum order quantity" v={qty(app.moq)} />
                  <Row k="Typical lead days" v={`${app.leadDays} days`} />
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {app && (
          <Card>
            <CardHeader>
              <CardTitle>Verification documents</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {app.documents.length === 0 ? (
                <p className="text-sm text-muted-foreground">No documents uploaded yet.</p>
              ) : (
                <div className="flex flex-col">
                  {app.documents.map((d) => (
                    <Row
                      key={d.id}
                      k={SUPPLIER_DOCUMENT_KINDS[d.kind]}
                      v={`${d.fileName} (${date(d.createdAt)})`}
                    />
                  ))}
                </div>
              )}
              <DocumentUpload supplierId={app.id} />
            </CardContent>
          </Card>
        )}

        <Notice tone="warn">
          Approval is an onboarding review only, not a quality guarantee. Upload your DTI/SEC registration, BIR
          certificate, business permit and a valid ID so we can verify you. Uploaded files are private to you and TULAY
          verifiers and can&apos;t be deleted.
        </Notice>
      </div>
    </>
  );
}
