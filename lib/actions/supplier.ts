"use server";

import { type ActionResult, dbError, parseInput } from "@/lib/action-result";
import { createClient } from "@/lib/supabase/server";
import { shippingRatesSchema, supplierDocumentSchema, supplierProfileSchema } from "@/lib/validation/forms";

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

/** Verified supplier: courier fee per zone (blank = platform flat fee). Pesos -> integer centavos here; the database caps the range. */
export async function saveShippingRates(raw: Record<string, unknown>): Promise<ActionResult> {
  const input = parseInput(shippingRatesSchema, raw);
  if (!input.ok) return input;
  const d = input.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_shipping_rates", {
    p_metro_manila: d.metroManila as number,
    p_luzon: d.luzon as number,
    p_visayas: d.visayas as number,
    p_mindanao: d.mindanao as number,
  }); // null = no rate for that zone (generated types do not mark function args nullable)
  return error ? dbError(error) : { ok: true };
}
