"use client";

import { demoAction } from "@/components/form";
import { Button } from "@/components/ui/button";
import type { SupplierStatus } from "@/lib/demo/types";

export function SupplierReviewButtons({ status }: { status: SupplierStatus }) {
  if (status === "approved") {
    return (
      <Button size="sm" variant="outline" onClick={() => demoAction("Supplier suspended")}>
        Suspend account
      </Button>
    );
  }
  if (status === "suspended") {
    return (
      <Button size="sm" onClick={() => demoAction("Supplier reactivated")}>
        Reactivate
      </Button>
    );
  }
  return (
    <>
      <Button size="sm" onClick={() => demoAction("Supplier approved")}>
        Approve
      </Button>
      <Button size="sm" variant="outline" onClick={() => demoAction("Supplier rejected")}>
        Reject
      </Button>
    </>
  );
}
