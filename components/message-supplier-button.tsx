"use client";

import { useRouter } from "next/navigation";
import { MessageSquareIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { OPEN_CHAT_EVENT, type OpenChatDetail } from "@/lib/chats";
import { cn } from "@/lib/utils";

/** Opens the messages dropdown on this supplier's chat. If no menu answers, the visitor is signed out, so go to login. */
export function MessageSupplierButton({
  supplierId,
  supplierName,
  className,
}: {
  supplierId: string;
  supplierName: string;
  className?: string;
}) {
  const router = useRouter();
  return (
    <button
      type="button"
      aria-label={`Message ${supplierName}`}
      className={cn(buttonVariants({ variant: "outline", size: "sm" }), className)}
      onClick={() => {
        const opened = !window.dispatchEvent(
          new CustomEvent<OpenChatDetail>(OPEN_CHAT_EVENT, {
            cancelable: true,
            detail: { supplierId, supplierName },
          }),
        );
        if (!opened) {
          router.push(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
        }
      }}
    >
      <MessageSquareIcon aria-hidden="true" />
      Message supplier
    </button>
  );
}
