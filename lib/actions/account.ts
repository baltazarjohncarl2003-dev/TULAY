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

const AVATAR_FILE = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp)$/;

/**
 * Points the profile at a picture the browser already uploaded to avatars/<user id>/<file>, then deletes the old one.
 * Storage RLS limits uploads to the caller's folder; the profiles check constraint does the same for the column.
 */
export async function setAvatar(storagePath: unknown): Promise<ActionResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Sign in first." };
  if (typeof storagePath !== "string" || !AVATAR_FILE.test(storagePath) || !storagePath.startsWith(`${user.id}/`)) {
    return { ok: false, error: "Invalid file path" };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.from("profiles").update({ avatar_path: storagePath }).eq("id", user.id).select("id");
  if (error) return dbError(error);
  if (!data.length) return { ok: false, error: "This account is suspended. Contact TULAY support." };
  // Delete every other file in the folder: the previous picture and any stray from a failed save.
  // The new picture is already saved, so a failed cleanup is logged, not shown to the user.
  const { data: files, error: listError } = await supabase.storage.from("avatars").list(user.id);
  const stale = (files ?? []).map((f) => `${user.id}/${f.name}`).filter((p) => p !== storagePath);
  const { error: removeError } = stale.length ? await supabase.storage.from("avatars").remove(stale) : { error: null };
  if (listError || removeError) console.error("setAvatar: old pictures not cleaned up", listError ?? removeError);
  return { ok: true };
}
