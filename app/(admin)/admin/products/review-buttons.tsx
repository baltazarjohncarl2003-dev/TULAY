"use client";

import { demoAction } from "@/components/form";
import { Button } from "@/components/ui/button";

export function ReviewButtons() {
  return (
    <div className="flex gap-2">
      <Button size="sm" onClick={() => demoAction("Product approved")}>
        Approve
      </Button>
      <Button size="sm" variant="outline" onClick={() => demoAction("Product rejected")}>
        Reject
      </Button>
    </div>
  );
}
