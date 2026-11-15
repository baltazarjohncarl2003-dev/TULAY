"use client";

import { useServerAction } from "@/components/form";
import { Button } from "@/components/ui/button";
import { respondInvite } from "@/lib/actions/deals";

/** Accept / decline while the invitation is open. The page already shows the status pill otherwise. */
export function InviteActions({
  rfqId,
  status,
  closed,
  canRespond = true,
}: {
  rfqId: string;
  status: "invited" | "accepted" | "declined";
  closed: boolean;
  /** False for suspended or unverified suppliers: the database refuses the answer. */
  canRespond?: boolean;
}) {
  const { run, pending } = useServerAction();
  if (status !== "invited" || closed) return null;
  return (
    <>
      <Button size="sm" disabled={pending || !canRespond} onClick={() => run(() => respondInvite(rfqId, true), "Invitation accepted")}>
        Accept
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={pending || !canRespond}
        onClick={() => run(() => respondInvite(rfqId, false), "Invitation declined")}
      >
        Decline
      </Button>
    </>
  );
}
