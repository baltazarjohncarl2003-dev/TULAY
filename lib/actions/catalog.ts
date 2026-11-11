"use server";

import { z } from "zod";
import { type ActionResult, dbError, parseInput } from "@/lib/action-result";
import { listMySaved } from "@/lib/data/catalog";
import { createClient } from "@/lib/supabase/server";
import { productMediaSchema, productReviewSchema, productSchema } from "@/lib/validation/forms";

// Listing workflow. The database checks who may do what (verified owner, verifier admin with MFA),
// the allowed status moves and the tier rules; these actions only validate input and pass it on.

const uuid = z.string().uuid();

function productArgs(d: z.output<typeof productSchema>) {
  return {
    p_category_slug: d.categorySlug,
    p_title: d.title,
    p_description: d.description,
    p_moq: d.moq,
    p_unit: d.unit,
    // The generated types say number; the column is bigint centavos.
    p_indicative_price_centavos: d.indicativePrice as number,
    p_lead_days: d.leadDays as number,
    p_return_class: d.returnClass,
    p_listing_type: d.listingType,
    p_price_tiers: d.priceTiers,
  };
}

/** Creates a draft listing. Retrying with the same idempotencyKey returns the same product. */
export async function createProduct(raw: Record<string, unknown>): Promise<{ ok: true; id: string } | Exclude<ActionResult, { ok: true }>> {
  const input = parseInput(productSchema, raw);
  if (!input.ok) return input;
  if (!input.data.idempotencyKey) return { ok: false, error: "Please reload the form and try again." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_product", { p_idempotency_key: input.data.idempotencyKey, ...productArgs(input.data) });
  return error ? (dbError(error) as Exclude<ActionResult, { ok: true }>) : { ok: true, id: data };
}

/** Saves edits. Editing an approved listing sends it back to review (the database does this). */
export async function updateProduct(productId: string, raw: Record<string, unknown>): Promise<ActionResult> {
  if (!uuid.safeParse(productId).success) return { ok: false, error: "Product not found" };
  const input = parseInput(productSchema, raw);
  if (!input.ok) return input;
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_product", { p_product_id: productId, ...productArgs(input.data) });
  return error ? dbError(error) : { ok: true };
}

/** Sends a draft or rejected listing for review. */
export async function submitProduct(productId: string): Promise<ActionResult> {
  if (!uuid.safeParse(productId).success) return { ok: false, error: "Product not found" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_product", { p_product_id: productId });
  return error ? dbError(error) : { ok: true };
}

/** Admin: approve or reject a pending listing (or take a live one down by rejecting it). */
export async function reviewProduct(raw: Record<string, unknown>): Promise<ActionResult> {
  const input = parseInput(productReviewSchema, raw);
  if (!input.ok) return input;
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_review_product", {
    p_product_id: input.data.productId,
    p_status: input.data.status,
    p_reason: input.data.reason,
  });
  return error ? dbError(error) : { ok: true };
}

/**
 * Records an image the browser already uploaded to product-media/<supplierId>/<productId>/<file>.
 * RLS only allows the verified owner, and only while the listing is not live.
 */
export async function addProductMedia(raw: Record<string, unknown>): Promise<ActionResult> {
  const input = parseInput(productMediaSchema, raw);
  if (!input.ok) return input;
  const { productId, storagePath } = input.data;
  if (storagePath.split("/")[1] !== productId) return { ok: false, error: "Invalid file path" };
  const supabase = await createClient();
  const { count } = await supabase.from("product_media").select("id", { count: "exact", head: true }).eq("product_id", productId);
  const { error } = await supabase.from("product_media").insert({ product_id: productId, storage_path: storagePath, sort_order: count ?? 0 });
  if (error?.code === "23505") return { ok: true }; // same file recorded twice (retry)
  return error ? dbError(error) : { ok: true };
}

/** Removes an image row and its file. RLS limits both to the owner. */
export async function removeProductMedia(storagePath: string): Promise<ActionResult> {
  if (!productMediaSchema.shape.storagePath.safeParse(storagePath).success) return { ok: false, error: "Invalid file path" };
  const supabase = await createClient();
  const { data, error } = await supabase.from("product_media").delete().eq("storage_path", storagePath).select("id");
  if (error) return dbError(error);
  if (data.length === 0) return { ok: false, error: "Image not found" };
  await supabase.storage.from("product-media").remove([storagePath]);
  return { ok: true };
}

/** Header search suggestions: up to 6 live listing titles for a query of 2+ characters. */
export async function suggestListings(q: string): Promise<string[]> {
  const query = typeof q === "string" ? q.trim().slice(0, 100) : "";
  if (query.length < 2) return [];
  const supabase = await createClient();
  const { data: rows } = await supabase.rpc("search_catalog", { p_query: query, p_page_size: 6 });
  if (!rows?.length) return [];
  const { data } = await supabase.from("products").select("id, title").in("id", rows.map((r) => r.product_id));
  const title = new Map((data ?? []).map((p) => [p.id, p.title]));
  return rows.flatMap((r) => (title.has(r.product_id) ? [title.get(r.product_id)!] : []));
}

/** The signed-in user's saved ids, or null for visitors. Lets static pages load saves after mount. */
export async function getMySaved(): Promise<{ products: string[]; suppliers: string[] } | null> {
  return listMySaved();
}

const savedSchema = z.object({ kind: z.enum(["product", "supplier"]), targetId: uuid, saved: z.boolean() });

/** Signed-in save / unsave. Saving twice is harmless (primary key). */
export async function setSaved(raw: Record<string, unknown>): Promise<ActionResult> {
  const input = parseInput(savedSchema, raw);
  if (!input.ok) return input;
  const { kind, targetId, saved } = input.data;
  const supabase = await createClient();
  const { error } = saved
    ? await supabase.from("saved_items").upsert({ kind, target_id: targetId }, { onConflict: "user_id,kind,target_id", ignoreDuplicates: true })
    : await supabase.from("saved_items").delete().eq("kind", kind).eq("target_id", targetId);
  return error ? dbError(error) : { ok: true };
}
