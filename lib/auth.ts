import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

export type UserRole = Database["public"]["Enums"]["user_role"];

export type SessionUser = {
  id: string;
  email: string;
  role: UserRole;
  status: Database["public"]["Enums"]["account_status"];
  fullName: string;
  /** "aal2" once the user has passed MFA in this session. */
  aal: string | null;
};

/** The signed-in user, verified against Supabase Auth (getClaims checks the JWT). Once per request. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  // Session checks read the clock (token expiry); mark the render as request-time first (Cache Components).
  await connection();
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;
  const { data: p } = await supabase
    .from("profiles")
    .select("id, email, role, status, full_name")
    .eq("id", claims.sub)
    .maybeSingle();
  if (!p) return null;
  return { id: p.id, email: p.email, role: p.role, status: p.status, fullName: p.full_name, aal: claims.aal ?? null };
});

export function homeFor(role: UserRole) {
  return `/${role}`;
}

/**
 * Page/layout guard. Any non-admin account may use both the buyer and the supplier workspace (one account
 * buys and sells; selling itself is gated by supplier verification in the database). Admins use only the
 * admin workspace and also need an MFA (aal2) session; RLS enforces the same rules in the database.
 */
export async function requireRole(role: UserRole): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.status !== "active") redirect("/login?suspended=1");
  if ((role === "admin") !== (user.role === "admin")) redirect(homeFor(user.role));
  if (role === "admin" && user.aal !== "aal2") redirect("/mfa");
  return user;
}
