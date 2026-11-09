"use server";

import { redirect } from "next/navigation";
import { type ActionResult, parseInput } from "@/lib/action-result";
import { homeFor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loginEmailSchema, loginVerifySchema } from "@/lib/validation/forms";

/** Emails a 6-digit code. New emails get an account with the chosen role; existing accounts keep theirs. */
export async function sendCode(raw: Record<string, unknown>): Promise<ActionResult> {
  const input = parseInput(loginEmailSchema, raw);
  if (!input.ok) return input;
  const { email, name, role } = input.data;
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true, data: { full_name: name, role } },
  });
  if (error) {
    return {
      ok: false,
      error: error.status === 429 ? "Too many codes requested. Wait a minute and try again." : "We could not send a code. Try again.",
    };
  }
  return { ok: true };
}

export async function verifyCode(raw: Record<string, unknown>): Promise<ActionResult> {
  const input = parseInput(loginVerifySchema, raw);
  if (!input.ok) return input;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ email: input.data.email, token: input.data.code, type: "email" });
  if (error || !data.user) return { ok: false, error: "That code is wrong or has expired." };

  const { data: profile } = await supabase.from("profiles").select("role, status").eq("id", data.user.id).single();
  if (!profile || profile.status !== "active") {
    await supabase.auth.signOut();
    return { ok: false, error: "This account is suspended. Contact TULAY support." };
  }
  redirect(profile.role === "admin" ? "/mfa" : homeFor(profile.role));
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
