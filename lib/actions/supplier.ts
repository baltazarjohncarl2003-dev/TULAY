"use server";

import { type ActionResult, dbError, parseInput } from "@/lib/action-result";
import { createClient } from "@/lib/supabase/server";
import { supplierDocumentSchema, supplierProfileSchema } from "@/lib/validation/forms";

/** Create or resubmit the caller's application. The database checks role, status and category. */
export async function submitApplication(raw: Record<string, unknown>): Promise<ActionResult> {
  const input = parseInput(supplierProfileSchema, raw);
  if (!input.ok) return input;
  const d = input.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_supplier_application", {
    p_business_name: d.businessName,
    p_legal_name: d.legalName,
    p_category_slug: d.categorySlug,
    p_city: d.city,
    p_province: d.province,
    p_moq: d.moq,
    p_lead_days: d.leadDays,
    p_description: d.description,
  });
  return error ? dbError(error) : { ok: true };
}

/**
 * Records a document the browser already uploaded to `supplier-documents/<supplierId>/<file>`.
 * Storage RLS only lets owners upload into their own folder; table RLS checks the same here.
 */
export async function addDocument(raw: Record<string, unknown>): Promise<ActionResult> {
  const input = parseInput(supplierDocumentSchema, raw);
  if (!input.ok) return input;
  const { kind, storagePath, fileName } = input.data;
  const supabase = await createClient();
  const { error } = await supabase
    .from("supplier_documents")
    .insert({ supplier_id: storagePath.split("/")[0], kind, storage_path: storagePath, file_name: fileName });
  if (error?.code === "23505") return { ok: true }; // same file recorded twice (retry)
  return error ? dbError(error) : { ok: true };
}
