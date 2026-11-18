"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { respondToBoardRequest } from "@/lib/actions/board";

/** The board's action for one request. The database decides whether a signed-in account may quote. */
export function RespondButton({
  rfqId,
  responded,
  isSupplier,
}: {
  rfqId: string;
  responded: boolean | null;
  isSupplier: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (responded === null) {
    return (
      <Link href="/login?next=/requests" className={buttonVariants({ size: "sm" })}>
        Sign in to quote
      </Link>
    );
  }
  if (!isSupplier) {
    return (
      <Link href="/sell" className={buttonVariants({ variant: "outline", size: "sm" })}>
        Sell on TULAY to quote
      </Link>
    );
  }
  if (responded) {
    return (
      <Link href={`/supplier/rfqs/${rfqId}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
        Open in your invitations
      </Link>
    );
  }

  function onClick() {
    startTransition(async () => {
      let res;
      try {
        res = await respondToBoardRequest(rfqId);
      } catch {
        toast.error("Could not reach the server. Check your connection and try again.");
        return;
      }
      if (res.ok) {
        toast.success("Added to your RFQ invitations");
        router.push(`/supplier/rfqs/${rfqId}`);
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <Button size="sm" disabled={pending} onClick={onClick}>
      Send a quote
    </Button>
  );
}
