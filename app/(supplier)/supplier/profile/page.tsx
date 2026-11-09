import { Notice, PageHeader, Row, StatusPill } from "@/components/common";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DEMO_SUPPLIER, categoryName } from "@/lib/demo/data";
import { qty } from "@/lib/format";
import { ProfileForm } from "./profile-form";

export const metadata = { title: "Company profile" };

export default function SupplierProfilePage() {
  const s = DEMO_SUPPLIER;
  const approved = s.status === "approved";
  return (
    <>
      <PageHeader
        eyebrow="Supplier onboarding"
        title="Company profile"
        description="Profiles are reviewed before suppliers can receive buyer RFQs."
        actions={<StatusPill status={s.status} />}
      />

      <div className="flex flex-col gap-6">
        {approved ? (
          <>
            <Notice>Profile approved. For corrections, contact TULAY support.</Notice>
            <Card>
              <CardHeader>
                <CardTitle>{s.businessName}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <p className="text-sm">{s.description}</p>
                <div className="flex flex-col">
                  <Row k="Legal name" v={s.legalName} />
                  <Row k="Category" v={categoryName(s.categorySlug)} />
                  <Row k="City, province" v={`${s.city}, ${s.province}`} />
                  <Row k="Minimum order quantity" v={qty(s.moq)} />
                  <Row k="Typical lead days" v={`${s.leadDays} days`} />
                </div>
              </CardContent>
            </Card>
          </>
        ) : (
          <ProfileForm supplier={s} />
        )}

        <Notice tone="warn">
          Approval is an onboarding review only. Business documents (DTI/SEC, BIR, IDs) are uploaded and verified
          separately. Document upload arrives with the backend.
        </Notice>
      </div>
    </>
  );
}
