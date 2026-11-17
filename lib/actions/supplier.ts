"use server";

import { updateTag } from "next/cache";
import { type ActionResult, dbError, parseInput } from "@/lib/action-result";
import { CATALOG_TAG } from "@/lib/data/catalog";
import { createClient } from "@/lib/supabase/server";
import { pickupSettingsSchema, shippingRatesSchema, supplierDocumentSchema, supplierProfileSchema } from "@/lib/validation/forms";

/** Verified supplier: pickup address and default parcel weight for Ninja Van bookings. Kg -> whole grams here. */
export async function savePickupSettings(raw: Record<string, unknown>): Promise<ActionResult> {
  const input = parseInput(pickupSettingsSchema, raw);
  if (!input.ok) return input;
  const d = input.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_pickup_settings", {
    p_sender_name: d.senderName,
    p_phone: d.phone,
    p_line1: d.line1,
    p_line2: d.line2,
    p_barangay: d.barangay,
    p_city: d.city,
    p_province: d.province,
    p_postal_code: d.postalCode,
    p_parcel_weight_grams: Math.round(d.parcelWeightKg * 1000),
  });
  return error ? dbError(error) : { ok: true };
}

/** Verified supplier: disconnect Ninja Van (stored tokens are deleted). */
export async function disconnectNinjaVan(): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("disconnect_courier", { p_carrier: "ninjavan" });
  return error ? dbError(error) : { ok: true };
}

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
  if (error) return dbError(error);
  updateTag(CATALOG_TAG);
  return { ok: true };
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
