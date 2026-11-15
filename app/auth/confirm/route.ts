import { NextResponse, type NextRequest } from "next/server";
import { landingAfterSignIn } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// Landing for the links in the confirm-email and reset-password emails (supabase/templates).
const TYPES = new Set(["email", "recovery"] as const);

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const tokenHash = params.get("token_hash");
  const type = params.get("type") as "email" | "recovery" | null;
  // Relative Location keeps the host the email link used (nextUrl.origin can differ, e.g. localhost vs 127.0.0.1,
  // which would drop the session cookie just set).
  const back = (path: string) => new NextResponse(null, { status: 303, headers: { Location: path } });

  if (!tokenHash || !type || !TYPES.has(type)) return back("/login?link=expired");
  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error || !data.user) return back("/login?link=expired");

  const to = await landingAfterSignIn(supabase, data.user.id, params.get("next"));
  if (!to) return back("/login?suspended=1");
  // A reset link always ends on the new-password form (admins go on to MFA after it).
  return back(type === "recovery" ? "/reset-password" : to);
}
