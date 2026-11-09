"use server";

import { redirect } from "next/navigation";
import { type ActionResult, parseInput } from "@/lib/action-result";
import { getSessionUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { mfaVerifySchema } from "@/lib/validation/forms";

export type EnrollResult = { ok: true; factorId: string; qrCode: string; secret: string } | { ok: false; error: string };

/** Starts authenticator-app enrolment. Drops any half-finished factor first so retries don't pile up. */
export async function enrollTotp(): Promise<EnrollResult> {
  const user = await getSessionUser();
  if (!user || user.role !== "admin") return { ok: false, error: "Admins only." };
  const supabase = await createClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  if (factors?.totp.length) return { ok: false, error: "An authenticator is already set up. Enter its code instead." };
  for (const f of factors?.all ?? []) {
    if (f.factor_type === "totp" && f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
  }
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "TULAY admin" });
  if (error || !data) return { ok: false, error: "Could not start authenticator setup. Try again." };
  return { ok: true, factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
}

export async function verifyTotp(raw: Record<string, unknown>): Promise<ActionResult> {
  const input = parseInput(mfaVerifySchema, raw);
  if (!input.ok) return input;
  const user = await getSessionUser();
  if (!user || user.role !== "admin") return { ok: false, error: "Admins only." };
  const supabase = await createClient();
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: input.data.factorId, code: input.data.code });
  if (error) return { ok: false, error: "That code is wrong or has expired." };
  redirect("/admin");
}
