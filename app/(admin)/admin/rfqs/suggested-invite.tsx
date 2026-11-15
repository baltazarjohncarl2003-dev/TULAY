"use client";

import { useServerAction } from "@/components/form";
import { Button } from "@/components/ui/button";
import { inviteSuppliers } from "@/lib/actions/deals";

/** One-click invite for a suggested supplier (the server action validates and the database checks the invite cap). */
export function SuggestedInvite({ rfqId, supplierId, invited }: { rfqId: string; supplierId: string; invited: boolean }) {
  const { run, pending } = useServerAction();
  if (invited) return <span className="text-xs text-muted-foreground">Already invited</span>;
  return (
    <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => inviteSuppliers(rfqId, { supplierIds: [supplierId] }), "Invitation sent")}>
      Invite
    </Button>
  );
}
