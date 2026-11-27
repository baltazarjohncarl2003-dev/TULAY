import { Notice, PageHeader, Row, StatusPill } from "@/components/common";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCourierVehicles, getMyApplication, getMyNinjaVan, getMyShippingRates, signedDocumentUrls } from "@/lib/data/supplier";
import { categoryName } from "@/lib/categories";
import { missingDocuments } from "@/lib/supplier-stats";
import { date, label, qty } from "@/lib/format";
import { SUPPLIER_DOCUMENT_KINDS } from "@/lib/validation/forms";
import { DocumentUpload } from "./document-upload";
import { NinjaVanCard } from "./ninjavan-card";
import { ProfileForm } from "./profile-form";
import { ShippingRatesForm } from "./shipping-rates-form";

export const metadata = { title: "Company Profile" };

export default async function SupplierProfilePage() {
  const app = await getMyApplication();
  const urls = await signedDocumentUrls(app?.documents.map((d) => d.storagePath) ?? []);
  const [shipping, ninjavan, vehicles] =
    app?.status === "verified"
      ? await Promise.all([getMyShippingRates(), getMyNinjaVan(), getCourierVehicles()])
      : [null, null, []];
  // Pending with every required document in = submitted; lock edits until TULAY decides.
  const awaitingReview =
    app?.status === "pending" && missingDocuments(app.documents.map((d) => d.kind)).length === 0;
  const canEdit = !app || app.status === "rejected" || (app.status === "pending" && !awaitingReview);
  return (
    <>
      <PageHeader
        eyebrow="Supplier onboarding"
        title="Company Profile"
        description="Profiles are reviewed before suppliers can receive buyer RFQs."
        actions={app ? <StatusPill status={app.status} /> : undefined}
      />

      <div className="flex flex-col gap-6">
        {!app ? (
          <>
            <Notice>Tell us about your company. TULAY reviews every application before you can receive buyer RFQs.</Notice>
            <ProfileForm initial={null} />
          </>
        ) : canEdit ? (
          <>
            {app.status === "rejected" && app.history[0]?.toStatus === "rejected" && (
              <Notice tone="warn">
                Your application was not approved: {app.history[0]?.reason}. Update it and resubmit.
              </Notice>
            )}
            {app.status === "pending" && (
              <Notice>
                Submitted {date(app.submittedAt)}. Upload all four required documents below to send it for review.
              </Notice>
            )}
            <ProfileForm initial={app} />
          </>
        ) : (
          <>
            {awaitingReview && (
              <Card className="border-primary/30 bg-primary/5">
                <CardHeader>
                  <CardTitle>Application Submitted</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-2 text-sm">
                  <p>
                    Thanks! We received your company profile and all required documents on {date(app.submittedAt)}.
                  </p>
                  <p className="text-muted-foreground">
                    TULAY is reviewing your application. You can&apos;t edit it or upload more files until it is
                    approved. We&apos;ll notify you once there is a decision.
                  </p>
                </CardContent>
              </Card>
            )}
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
            {app.status === "verified" && shipping && (
              <Card>
                <CardHeader>
                  <CardTitle>Shipping Fees</CardTitle>
                </CardHeader>
                <CardContent>
                  <ShippingRatesForm rates={shipping.rates} flatFeeCentavos={shipping.flatFeeCentavos} />
                </CardContent>
              </Card>
            )}
            {app.status === "verified" && ninjavan && (
              <Card id="ninjavan" className="scroll-mt-20">
                <CardHeader>
                  <CardTitle>Courier pickup</CardTitle>
                </CardHeader>
                <CardContent>
                  <NinjaVanCard pickup={ninjavan.pickup} vehicles={vehicles} />
                </CardContent>
              </Card>
            )}
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
                      v={
                        <>
                          {urls[d.storagePath] ? (
                            <a href={urls[d.storagePath]} target="_blank" rel="noopener noreferrer" className="text-primary underline">
                              {d.fileName}
                            </a>
                          ) : (
                            d.fileName
                          )}{" "}
                          ({date(d.createdAt)})
                        </>
                      }
                    />
                  ))}
                </div>
              )}
              {canEdit && <DocumentUpload supplierId={app.id} />}
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
