"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { type ActionResult, parseInput } from "@/lib/action-result";
import { getSessionUser, homeFor, landingAfterSignIn } from "@/lib/auth";
import { FLASH_COOKIE, FLASH_OPTIONS } from "@/lib/flash";
import { RESET_COOKIE } from "@/lib/next-path";
import { createClient } from "@/lib/supabase/server";
import { forgotPasswordSchema, newPasswordSchema } from "@/lib/validation/forms";

const SUSPENDED = "This account is suspended. Contact TULAY support.";
const TOO_MANY = "Too many attempts. Wait a minute and try again.";

/** After the browser signed in (so Supabase rate-limits each person's own IP): checks the account and picks the landing page. */
export async function finishSignIn(next: unknown): Promise<ActionResult> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { ok: false, error: "Wrong email or password." };
  const to = await landingAfterSignIn(supabase, data.user.id, next);
  if (!to) return { ok: false, error: SUSPENDED };
  (await cookies()).set(FLASH_COOKIE, "signed_in", FLASH_OPTIONS);
  redirect(to);
}

/** Sends the confirmation email again. Always reports success so nobody can probe for accounts. */
export async function resendConfirmation(raw: Record<string, unknown>): Promise<ActionResult> {
  const input = parseInput(forgotPasswordSchema, raw);
  if (!input.ok) return input;
  const supabase = await createClient();
  const { error } = await supabase.auth.resend({ type: "signup", email: input.data.email });
  if (error?.status === 429) return { ok: false, error: TOO_MANY };
  return { ok: true };
}

/** Emails a reset link when the account exists. Always reports success so nobody can probe for accounts. */
export async function requestPasswordReset(raw: Record<string, unknown>): Promise<ActionResult> {
  const input = parseInput(forgotPasswordSchema, raw);
  if (!input.ok) return input;
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(input.data.email);
  if (error?.status === 429) return { ok: false, error: TOO_MANY };
  return { ok: true };
}

/** Sets a new password for the signed-in user (reached from the reset link). */
export async function updatePassword(raw: Record<string, unknown>): Promise<ActionResult> {
  const input = parseInput(newPasswordSchema, raw);
  if (!input.ok) return input;
  const user = await getSessionUser();
  // A signed-in session alone is not enough (shared or stolen browser): the reset link must have been used.
  const jar = await cookies();
  if (!user || jar.get(RESET_COOKIE)?.value !== user.id) {
    return { ok: false, error: "Your reset link has expired. Request a new one." };
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: input.data.password });
  if (error?.code === "same_password") return { ok: false, error: "Use a password you haven't used here before." };
  if (error?.code === "weak_password") return { ok: false, error: "Choose a stronger password.", fieldErrors: { password: [error.message] } };
  if (error) return { ok: false, error: "We could not update your password. Try again." };
  jar.delete(RESET_COOKIE);
  jar.set(FLASH_COOKIE, "password_updated", FLASH_OPTIONS);
  redirect(user.role === "admin" ? "/mfa" : homeFor(user.role));
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
