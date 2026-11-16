import "server-only";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { FLASH_COOKIE, FLASH_OPTIONS, type FlashKey } from "@/lib/flash";
import { createClient } from "@/lib/supabase/server";

// Shared by /api/ninjavan/connect and /api/ninjavan/callback (supplier connects its own Ninja Van account).

export const STATE_COOKIE = "tulay_nv_state";
export const STATE_COOKIE_OPTIONS = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/api/ninjavan", maxAge: 600 };
export const SETTINGS_PATH = "/supplier/profile#ninjavan";

/** The signed-in user's verified supplier id, or null. */
export async function myVerifiedSupplierId(): Promise<string | null> {
  const user = await getSessionUser();
  if (!user || user.status !== "active") return null;
  const supabase = await createClient();
  const { data } = await supabase.from("suppliers").select("id, status").eq("owner_id", user.id).maybeSingle();
  return data?.status === "verified" ? data.id : null;
}

/** Relative redirect (keeps the host the browser used) with a one-time toast. */
export function backToSettings(flash: FlashKey, path = SETTINGS_PATH) {
  const res = new NextResponse(null, { status: 303, headers: { Location: path } });
  res.cookies.set(FLASH_COOKIE, flash, FLASH_OPTIONS);
  res.cookies.set(STATE_COOKIE, "", { ...STATE_COOKIE_OPTIONS, maxAge: 0 });
  return res;
}
