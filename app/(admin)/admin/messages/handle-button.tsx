"use client";

import { useServerAction } from "@/components/form";
import { Button } from "@/components/ui/button";
import { handleContactMessage } from "@/lib/actions/contact";

export function HandleButton({ id }: { id: string }) {
  const { run, pending } = useServerAction();
  return (
    <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => handleContactMessage(id), "Marked handled")}>
      Mark handled
    </Button>
  );
}
