import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { mockEnabled } from "@/lib/shipping/ninjavan";
import { MOCK_CODE } from "@/lib/shipping/ninjavan-mock";
import { backToSettings, myVerifiedSupplierId, STATE_COOKIE, STATE_COOKIE_OPTIONS } from "@/lib/shipping/ninjavan-oauth";
import { authorizeUrl, isConfigured, ninjaVanConfig } from "@/lib/shipping/ninjavan-wire";

// Supplier clicks "Connect Ninja Van": send them to Ninja Dash to approve TULAY, with a one-time state
// (kept in an httpOnly cookie) that the callback checks, so nobody can attach their account to someone else's.
export async function GET() {
  if (!(await myVerifiedSupplierId())) return new NextResponse(null, { status: 303, headers: { Location: "/supplier/profile" } });
  const state = randomBytes(24).toString("base64url");
  let target: string;
  if (mockEnabled()) { // the local mock consents at once
    target = `/api/ninjavan/callback?code=${MOCK_CODE}&state=${state}`;
  } else {
    const config = ninjaVanConfig();
    if (!isConfigured(config)) return backToSettings("ninjavan_unavailable");
    target = authorizeUrl(config, state);
  }
  const res = new NextResponse(null, { status: 303, headers: { Location: target } });
  res.cookies.set(STATE_COOKIE, state, STATE_COOKIE_OPTIONS);
  return res;
}
