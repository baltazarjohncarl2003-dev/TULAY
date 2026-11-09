"use server";

import { type ActionResult, dbError, parseInput } from "@/lib/action-result";
import { getSessionUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { accountSchema } from "@/lib/validation/forms";

export async function saveProfile(raw: Record<string, unknown>): Promise<ActionResult> {
  const input = parseInput(accountSchema, raw);
  if (!input.ok) return input;
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Sign in first." };
  const d = input.data;
  const supabase = await createClient();
  // RLS limits this to the caller's own active row; column grants keep role and status out of reach.
  const { data, error } = await supabase
    .from("profiles")
    .update({
      full_name: d.name,
      phone: d.phone,
      business_name: d.businessName,
      industry: d.industry,
      city: d.city,
      province: d.province,
      website: d.website,
      about: d.about,
    })
    .eq("id", user.id)
    .select("id");
  if (error) return dbError(error);
  if (!data.length) return { ok: false, error: "This account is suspended. Contact TULAY support." };
  return { ok: true };
}
