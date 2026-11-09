"use client";

import { demoAction } from "@/components/form";
import { Button } from "@/components/ui/button";

export function InviteActions() {
  return (
    <>
      <Button size="sm" onClick={() => demoAction("Invitation accepted")}>
        Accept
      </Button>
      <Button size="sm" variant="outline" onClick={() => demoAction("Invitation declined")}>
        Decline
      </Button>
    </>
  );
}
