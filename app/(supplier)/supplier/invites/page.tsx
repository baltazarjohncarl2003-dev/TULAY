import Link from "next/link";
import { EmptyState, PageHeader, StatusPill } from "@/components/common";
import { buttonVariants } from "@/components/ui/button";
import { DEMO_SUPPLIER, INVITES, rfqById } from "@/lib/demo/data";
import { date, qty } from "@/lib/format";
import { InviteActions } from "./invite-actions";

export const metadata = { title: "Assigned RFQs" };

export default function SupplierInvitesPage() {
  const rows = INVITES.filter((i) => i.supplierId === DEMO_SUPPLIER.id).flatMap((invite) => {
    const rfq = rfqById(invite.rfqId);
    return rfq ? [{ invite, rfq }] : [];
  });

  return (
    <>
      <PageHeader
        eyebrow="Supplier opportunities"
        title="Assigned RFQs"
        description="Your opted-in matching invitations appear here, including automatic requests."
        actions={<StatusPill status={DEMO_SUPPLIER.status} />}
      />

      {rows.length ? (
        <ul className="flex flex-col gap-3">
          {rows.map(({ invite, rfq }) => (
            <li key={rfq.id} className="flex flex-col gap-3 rounded-lg border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs font-semibold tracking-wide text-primary uppercase">{rfq.ref}</span>
                  <h2 className="font-semibold">{rfq.product}</h2>
                </div>
                <StatusPill status={invite.status} />
              </div>

              <p className="text-sm text-muted-foreground">
                {`${qty(rfq.quantity)} ${rfq.unit} • ${rfq.city}, ${rfq.province} • Target ${date(rfq.requiredBy)}`}
              </p>

              <div className="flex flex-wrap gap-2">
                <Link href={`/supplier/rfqs/${rfq.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                  View requirement
                </Link>
                {invite.status === "invited" && <InviteActions />}
                {invite.status === "accepted" && (
                  <Link href={`/supplier/rfqs/${rfq.id}/quote`} className={buttonVariants({ size: "sm" })}>
                    Submit / revise quote
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="No assigned sourcing requests yet.">
          <p>Complete your capabilities and wait for matching.</p>
        </EmptyState>
      )}
    </>
  );
}
