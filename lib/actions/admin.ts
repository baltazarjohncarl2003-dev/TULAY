"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { type ActionResult, dbError, parseInput } from "@/lib/action-result";
import { CATALOG_TAG } from "@/lib/data/catalog";
import { createClient } from "@/lib/supabase/server";
import { commissionScheduleSchema, settingSchema, supplierStatusSchema } from "@/lib/validation/forms";

// The Postgres functions check sub-role + MFA and write the audit log; these actions only validate and forward.

export async function setSupplierStatus(raw: Record<string, unknown>): Promise<ActionResult> {
  const input = parseInput(supplierStatusSchema, raw);
  if (!input.ok) return input;
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_supplier_status", {
    p_supplier_id: input.data.supplierId,
    p_status: input.data.status,
    p_reason: input.data.reason,
  });
  if (error) return dbError(error);
  updateTag(CATALOG_TAG);
  return { ok: true };
}

// Mirrors the range checks in admin_update_setting (the database stays the authority) so they show as field errors.
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
function numberRangeError(key: string, n: number): string | null {
  if (n > 2147483647) return "Too large (most is 2,147,483,647).";
  if (key.endsWith("_bps") && n > 10000) return "Basis points go from 0 to 10000 (10000 = 100%).";
  if (/(_days|_minutes|_hours|_per_day|_per_hour)$/.test(key) || key === "rfq_max_invites" || key === "cod_max_refusals") {
    if (n < 1) return "Must be at least 1.";
  }
  return null;
}

const termsSchema = z.object({
  returnClass: z.enum(["standard", "custom", "final_sale"]),
  body: z.string().trim().min(1, "Required").max(5000),
});

/** Super admin: the terms shown on new chat agreements for one return class. Agreed terms keep their own copy. */
export async function updateTerms(raw: Record<string, unknown>): Promise<ActionResult> {
  const input = parseInput(termsSchema, raw);
  if (!input.ok) return input;
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_update_terms", {
    p_return_class: input.data.returnClass,
    p_body: input.data.body,
  });
  return error ? dbError(error) : { ok: true };
}

/** Numbers stay whole numbers; strings stay strings. The setting's current type decides. */
export async function updateSetting(raw: Record<string, unknown>): Promise<ActionResult> {
  const input = parseInput(settingSchema, raw);
  if (!input.ok) return input;
  const { key, value } = input.data;
  const supabase = await createClient();
  const { data: current, error: readError } = await supabase.from("platform_settings").select("value").eq("key", key).single();
  if (readError || !current) return { ok: false, error: "Unknown setting." };
  let next: number | string = value;
  const bad = (message: string): ActionResult => ({ ok: false, error: message, fieldErrors: { value: [message] } });
  if (typeof current.value === "number") {
    if (!/^\d{1,12}$/.test(value)) return bad("Enter a whole number.");
    next = Number(value);
    const range = numberRangeError(key, next);
    if (range) return bad(range);
  } else if (key.endsWith("email") && value !== "" && !EMAIL.test(value)) {
    return bad("Enter a valid email address.");
  }
  const { error } = await supabase.rpc("admin_update_setting", { p_key: key, p_value: next });
  return error ? dbError(error) : { ok: true };
}

export async function addCommissionSchedule(raw: Record<string, unknown>): Promise<ActionResult> {
  const input = parseInput(commissionScheduleSchema, raw);
  if (!input.ok) return input;
  const { ratePercent, startsOn, categorySlug, note } = input.data;
  const supabase = await createClient();
  let categoryId: string | undefined;
  if (categorySlug) {
    const { data: cat } = await supabase.from("categories").select("id").eq("slug", categorySlug).single();
    if (!cat) return { ok: false, error: "Unknown category.", fieldErrors: { categorySlug: ["Unknown category"] } };
    categoryId = cat.id;
  }
  const { error } = await supabase.rpc("admin_add_commission_schedule", {
    p_rate_bps: ratePercent,
    p_starts_at: `${startsOn}T00:00:00+08:00`, // midnight Philippine time
    p_category_id: categoryId,
    p_note: note,
  });
  return error ? dbError(error) : { ok: true };
}

// ---------------------------------------------------------------- users (A-4)

const accountStatusSchema = z.object({
  userId: z.string().uuid(),
  status: z.enum(["active", "suspended"]),
  reason: z.string().trim().min(3, "Give a reason (at least 3 characters)").max(500),
});

/** Support: suspend or reactivate an account. The next request of a suspended user goes to /login?suspended=1. */
export async function setAccountStatus(raw: Record<string, unknown>): Promise<ActionResult> {
  const input = parseInput(accountStatusSchema, raw);
  if (!input.ok) return input;
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_account_status", {
    p_user_id: input.data.userId,
    p_status: input.data.status,
    p_reason: input.data.reason,
  });
  return error ? dbError(error) : { ok: true };
}

const roleChangeSchema = z.object({
  userId: z.string().uuid(),
  subRole: z.enum(["verifier", "support", "finance", "super_admin"]),
  grant: z.boolean(),
});

/** Super admin: grant or revoke one sub-role. Revoking the last one turns the account back into a buyer. */
export async function changeAdminRole(raw: Record<string, unknown>): Promise<ActionResult> {
  const input = parseInput(roleChangeSchema, raw);
  if (!input.ok) return input;
  const { userId, subRole, grant } = input.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc(grant ? "admin_grant_role" : "admin_revoke_role", {
    p_user_id: userId,
    p_sub_role: subRole,
  });
  return error ? dbError(error) : { ok: true };
}

// ---------------------------------------------------------------- search synonyms (A-25)

const synonymSchema = z.object({
  term: z.string().trim().min(2, "At least 2 characters").max(60),
  synonym: z.string().trim().min(2, "At least 2 characters").max(60),
});

/** Verifier: two words that should find each other in marketplace search (stored both ways). */
export async function addSearchSynonym(raw: Record<string, unknown>): Promise<ActionResult> {
  const input = parseInput(synonymSchema, raw);
  if (!input.ok) return input;
  if (input.data.term.toLowerCase() === input.data.synonym.toLowerCase()) {
    return { ok: false, error: "Enter two different words.", fieldErrors: { synonym: ["Enter a different word"] } };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_add_search_synonym", { p_term: input.data.term, p_synonym: input.data.synonym });
  return error ? dbError(error) : { ok: true };
}

export async function removeSearchSynonym(raw: Record<string, unknown>): Promise<ActionResult> {
  const input = parseInput(synonymSchema, raw);
  if (!input.ok) return input;
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_remove_search_synonym", { p_term: input.data.term, p_synonym: input.data.synonym });
  return error ? dbError(error) : { ok: true };
}

// ---------------------------------------------------------------- banned terms

const bannedTermSchema = z.object({ bannedTerm: z.string().trim().min(2, "At least 2 characters").max(60) });

/** Verifier: a word or phrase listings and RFQs may not contain (also dropped from TULAY AI search). */
export async function addBannedTerm(raw: Record<string, unknown>): Promise<ActionResult> {
  const input = parseInput(bannedTermSchema, raw);
  if (!input.ok) return input;
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_add_banned_term", { p_term: input.data.bannedTerm });
  return error ? dbError(error) : { ok: true };
}

export async function removeBannedTerm(raw: Record<string, unknown>): Promise<ActionResult> {
  const input = parseInput(bannedTermSchema, raw);
  if (!input.ok) return input;
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_remove_banned_term", { p_term: input.data.bannedTerm });
  return error ? dbError(error) : { ok: true };
}
