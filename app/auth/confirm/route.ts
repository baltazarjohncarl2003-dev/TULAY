import { NextResponse, type NextRequest } from "next/server";
import { landingAfterSignIn } from "@/lib/auth";
import { FLASH_COOKIE, FLASH_OPTIONS } from "@/lib/flash";
import { RESET_COOKIE } from "@/lib/next-path";
import { signResetProof } from "@/lib/reset-proof";
import { createClient } from "@/lib/supabase/server";

// The confirm-email and reset-password emails link to /auth/continue, a page with a button that POSTs here.
// Verifying only on POST stops mail scanners (Safe Links and similar), which open links with GET, from
// using up the one-time token before the person clicks.
const TYPES = new Set(["email", "recovery"] as const);

// Relative Location keeps the host the email link used (nextUrl.origin can differ, e.g. localhost vs 127.0.0.1,
// which would drop the session cookie just set).
const back = (path: string) => new NextResponse(null, { status: 303, headers: { Location: path } });

/** Links sent before the button page existed: forward them to it. */
export function GET(request: NextRequest) {
  return back(`/auth/continue?${request.nextUrl.searchParams.toString()}`);
}

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const tokenHash = String(form.get("token_hash") ?? "");
  const type = String(form.get("type") ?? "") as "email" | "recovery";
  if (!tokenHash || !TYPES.has(type)) return back("/login?link=expired");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error || !data.user) return back("/login?link=expired");

  // Sign-up stores the page the visitor was heading to (lib: signUp); landingAfterSignIn validates it.
  const to = await landingAfterSignIn(supabase, data.user.id, data.user.user_metadata?.next);
  if (!to) return back("/login?suspended=1");
  if (type !== "recovery") {
    const res = back(to);
    res.cookies.set(FLASH_COOKIE, "confirmed", FLASH_OPTIONS);
    return res;
  }

  // A reset link always ends on the new-password form, which only accepts this signed proof of a recent link.
  const res = back("/reset-password");
  res.cookies.set(RESET_COOKIE, signResetProof(data.user.id), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 15 * 60,
  });
  return res;
}
