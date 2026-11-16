import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { ninjavanCourier } from "@/lib/shipping/ninjavan";
import { backToSettings, myVerifiedSupplierId, STATE_COOKIE } from "@/lib/shipping/ninjavan-oauth";

// Ninja Dash sends the supplier back here with a one-time code. The state must match the cookie set by
// /api/ninjavan/connect in this same browser; the code is traded for tokens, which go straight to Vault.
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code") ?? "";
  const state = Buffer.from(request.nextUrl.searchParams.get("state") ?? "");
  const expected = Buffer.from(request.cookies.get(STATE_COOKIE)?.value ?? "");
  if (!code || expected.length === 0 || state.length !== expected.length || !timingSafeEqual(state, expected)) {
    return backToSettings("ninjavan_failed");
  }
  const supplierId = await myVerifiedSupplierId();
  if (!supplierId) return backToSettings("ninjavan_failed", "/supplier/profile");
  try {
    await ninjavanCourier.connect(supplierId, code);
  } catch (e) {
    console.error("ninjavan connect failed", e instanceof Error ? e.message : e);
    return backToSettings("ninjavan_failed");
  }
  return backToSettings("ninjavan_connected");
}
