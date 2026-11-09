"use server";

import { type ActionResult, dbError, parseInput } from "@/lib/action-result";
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
  if (typeof current.value === "number") {
    if (!/^\d{1,12}$/.test(value)) return { ok: false, error: "Enter a whole number.", fieldErrors: { value: ["Whole number"] } };
    next = Number(value);
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
