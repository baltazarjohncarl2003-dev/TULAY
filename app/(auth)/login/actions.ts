"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { type ActionResult, parseInput } from "@/lib/action-result";
import { getSessionUser, homeFor, landingAfterSignIn } from "@/lib/auth";
import { FLASH_COOKIE, FLASH_OPTIONS } from "@/lib/flash";
import { RESET_COOKIE, safeNextPath } from "@/lib/next-path";
import { createClient } from "@/lib/supabase/server";
import { forgotPasswordSchema, newPasswordSchema, signInSchema, signUpSchema } from "@/lib/validation/forms";

const SUSPENDED = "This account is suspended. Contact TULAY support.";
const TOO_MANY = "Too many attempts. Wait a minute and try again.";

export async function signIn(raw: Record<string, unknown>): Promise<ActionResult> {
  const input = parseInput(signInSchema, raw);
  if (!input.ok) return input;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(input.data);
  if (error?.code === "email_not_confirmed") {
    return { ok: false, error: "Confirm your email first. Open the link we sent to your inbox." };
  }
  if (error?.status === 429) return { ok: false, error: TOO_MANY };
  if (error || !data.user) return { ok: false, error: "Wrong email or password." };

  const to = await landingAfterSignIn(supabase, data.user.id, raw.next);
  if (!to) return { ok: false, error: SUSPENDED };
  (await cookies()).set(FLASH_COOKIE, "signed_in", FLASH_OPTIONS);
  redirect(to);
}

/** Creates the account; Supabase emails a confirmation link (handled by /auth/confirm). */
export async function signUp(raw: Record<string, unknown>): Promise<ActionResult> {
  const input = parseInput(signUpSchema, raw);
  if (!input.ok) return input;
  const { email, password, name, role } = input.data;
  const supabase = await createClient();
  // The handle_new_user trigger reads full_name and role; /auth/confirm sends the person on to `next`.
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: name, role, next: safeNextPath(raw.next) ?? "", accepted_terms_at: new Date().toISOString() },
    },
  });
  if (error?.code === "weak_password") {
    return { ok: false, error: "Choose a stronger password.", fieldErrors: { password: [error.message] } };
  }
  if (error?.status === 429) return { ok: false, error: TOO_MANY };
  // An already-registered email gets no error from Supabase (no account enumeration); the UI says "check your email" either way.
  if (error) return { ok: false, error: "We could not create the account. Try again." };
  return { ok: true };
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
