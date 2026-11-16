"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { toast } from "sonner";
import { FLASH_COOKIE, FLASH_ERRORS, FLASH_MESSAGES } from "@/lib/flash";

/** Shows the one-time message a server redirect left in the flash cookie, then clears it. */
export function FlashToast() {
  const pathname = usePathname();
  useEffect(() => {
    const match = document.cookie.match(new RegExp(`(?:^|; )${FLASH_COOKIE}=([^;]*)`));
    if (!match) return;
    document.cookie = `${FLASH_COOKIE}=; path=/; max-age=0`;
    const key = match[1];
    if (key in FLASH_MESSAGES) toast.success(FLASH_MESSAGES[key as keyof typeof FLASH_MESSAGES]);
    else if (key in FLASH_ERRORS) toast.error(FLASH_ERRORS[key as keyof typeof FLASH_ERRORS]);
  }, [pathname]); // re-check after client-side redirects (server actions), not just first load
  return null;
}
