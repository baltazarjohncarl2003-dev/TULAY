import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { PATH_HEADER, safeNextPath } from "@/lib/next-path";
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
  /** Admin sub-roles held (empty for non-admins). The database enforces them; the UI only hides what would fail. */
  subRoles: AdminSubRole[];
};

export type AdminSubRole = Database["public"]["Enums"]["admin_sub_role"];

/** True when an admin may use a feature needing one of `roles` (super_admin may do everything). */
export function canAdmin(user: Pick<SessionUser, "subRoles">, ...roles: AdminSubRole[]): boolean {
  return user.subRoles.includes("super_admin") || roles.some((r) => user.subRoles.includes(r));
}

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
  let subRoles: AdminSubRole[] = [];
  if (p.role === "admin") {
    const { data: roles } = await supabase.from("admin_roles").select("sub_role").eq("user_id", p.id);
    subRoles = (roles ?? []).map((r) => r.sub_role);
  }
  return { id: p.id, email: p.email, role: p.role, status: p.status, fullName: p.full_name, aal: claims.aal ?? null, subRoles };
});

/** The fake courier page is for the order's supplier or TULAY support, never the buyer. */
export async function canPlayCourier(supplierId: string | undefined | null): Promise<boolean> {
  if (!supplierId) return false;
  const supabase = await createClient();
  const [{ data: mine }, { data: support }] = await Promise.all([
    supabase.rpc("my_supplier_id"),
    supabase.rpc("has_admin_role", { roles: ["support"] }),
  ]);
  return mine === supplierId || support === true;
}

export function homeFor(role: UserRole) {
  return `/${role}`;
}

/**
 * Where a user goes right after a successful sign-in (password or email link). Suspended or profile-less
 * accounts are signed out again and get null. Admins always pass MFA first.
 */
export async function landingAfterSignIn(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  next: unknown,
): Promise<string | null> {
  const { data: profile } = await supabase.from("profiles").select("role, status").eq("id", userId).single();
  if (!profile || profile.status !== "active") {
    await supabase.auth.signOut();
    return null;
  }
  return profile.role === "admin" ? "/mfa" : (safeNextPath(next) ?? homeFor(profile.role));
}

/**
 * Page/layout guard. Any non-admin account may use both the buyer and the supplier workspace (one account
 * buys and sells; selling itself is gated by supplier verification in the database). Admins use only the
 * admin workspace and also need an MFA (aal2) session; RLS enforces the same rules in the database.
 */
export async function requireRole(role: UserRole): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    const next = safeNextPath((await headers()).get(PATH_HEADER));
    redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  }
  if (user.status !== "active") redirect("/login?suspended=1");
  if ((role === "admin") !== (user.role === "admin")) redirect(homeFor(user.role));
  if (role === "admin" && user.aal !== "aal2") redirect("/mfa");
  return user;
}
