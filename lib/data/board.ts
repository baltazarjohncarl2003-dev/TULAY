import "server-only";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

/** Rows per page on the board. The database returns this many per page; keep in step with list_board_requests. */
export const BOARD_PAGE_SIZE = 24;

export type BoardRequest = {
  id: string;
  ref: string;
  product: string;
  categoryName: string | null;
  categorySlug: string | null;
  /** Cut to 300 characters by the database. */
  description: string;
  quantity: number | null;
  unit: Database["public"]["Enums"]["product_unit"];
  province: string;
  /** YYYY-MM-DD */
  requiredBy: string | null;
  createdAt: string;
  /** null when signed out; true when the caller's supplier already joined. */
  alreadyResponded: boolean | null;
};

/** Open buyer requests on the board, one page at a time, newest first. Safe for anyone, signed in or not. */
export async function listBoardRequests(page: number): Promise<{ requests: BoardRequest[]; total: number }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_board_requests", { p_page: page });
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  return {
    requests: rows.map((r) => ({
      id: r.id,
      ref: r.ref,
      product: r.product,
      categoryName: r.category_name,
      categorySlug: r.category_slug,
      description: r.description,
      quantity: r.quantity,
      unit: r.unit,
      province: r.province,
      requiredBy: r.required_by,
      createdAt: r.created_at,
      alreadyResponded: r.already_responded,
    })),
    // Every row carries the same total. An empty page has no rows, so the total reads as 0.
    total: rows[0]?.total ?? 0,
  };
}

/** True when the signed-in user has a supplier account (any status; the database still requires it verified to quote). */
export async function hasSupplierAccount(): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_supplier_id");
  if (error) throw new Error(error.message);
  return !!data;
}
