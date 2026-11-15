"use client";

import { useState } from "react";
import { useServerAction } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { changeAdminRole, setAccountStatus } from "@/lib/actions/admin";
import { label } from "@/lib/format";

const SUB_ROLES = ["verifier", "support", "finance", "super_admin"] as const;

export function UserActions({
  userId,
  name,
  status,
  isAdmin,
  subRoles,
  canManageRoles,
}: {
  userId: string;
  name: string;
  status: "active" | "suspended";
  isAdmin: boolean;
  subRoles: string[];
  canManageRoles: boolean;
}) {
  const { run, pending } = useServerAction();
  const [statusOpen, setStatusOpen] = useState(false);
  const [rolesOpen, setRolesOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const next = status === "active" ? "suspended" : "active";

  function confirmStatus() {
    if (reason.trim().length < 3) {
      setReasonError("Give a reason (at least 3 characters)");
      return;
    }
    setReasonError(null);
    run(
      () => setAccountStatus({ userId, status: next, reason: reason.trim() }),
      next === "suspended" ? "Account suspended" : "Account reactivated",
      () => setStatusOpen(false),
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        size="sm"
        variant={status === "active" ? "destructive" : "outline"}
        disabled={pending}
        onClick={() => {
          setReason("");
          setReasonError(null);
          setStatusOpen(true);
        }}
      >
        {status === "active" ? "Suspend" : "Reactivate"}
      </Button>
      {canManageRoles && (
        <Button size="sm" variant="outline" disabled={pending} onClick={() => setRolesOpen(true)}>
          Admin roles
        </Button>
      )}

      <Dialog open={statusOpen} onOpenChange={setStatusOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {status === "active" ? "Suspend" : "Reactivate"} {name}
            </DialogTitle>
            <DialogDescription>
              {status === "active"
                ? "The person is signed out at their next request and cannot buy or sell until reactivated."
                : "The person can sign in and trade again."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Textarea
              aria-label="Reason"
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              aria-invalid={reasonError ? true : undefined}
            />
            {reasonError && (
              <p className="text-xs text-destructive" role="alert">
                {reasonError}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setStatusOpen(false)}>
              Cancel
            </Button>
            <Button type="button" variant={status === "active" ? "destructive" : "default"} disabled={pending} onClick={confirmStatus}>
              {status === "active" ? "Suspend" : "Reactivate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rolesOpen} onOpenChange={setRolesOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Admin roles for {name}</DialogTitle>
            <DialogDescription>
              {isAdmin
                ? "Removing the last role turns this account back into a buyer."
                : "Granting a role makes this an admin account. Supplier accounts cannot be admins; use a separate account."}
            </DialogDescription>
          </DialogHeader>
          <ul className="flex flex-col gap-2">
            {SUB_ROLES.map((r) => {
              const held = subRoles.includes(r);
              return (
                <li key={r} className="flex items-center justify-between gap-2 rounded-lg border p-2 text-sm">
                  <span>
                    {label(r)} {held && <span className="text-xs text-muted-foreground">(held)</span>}
                  </span>
                  <Button
                    size="sm"
                    variant={held ? "outline" : "default"}
                    disabled={pending}
                    onClick={() =>
                      run(
                        () => changeAdminRole({ userId, subRole: r, grant: !held }),
                        held ? `${label(r)} removed` : `${label(r)} granted`,
                        () => setRolesOpen(false),
                      )
                    }
                  >
                    {held ? "Remove" : "Grant"}
                  </Button>
                </li>
              );
            })}
          </ul>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRolesOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
