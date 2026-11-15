import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import type { Order } from "@/lib/types";

export type SupplierStatus = Database["public"]["Enums"]["supplier_status"];
export type SupplierDocumentKind = Database["public"]["Enums"]["supplier_document_kind"];

export type SupplierApplication = {
  id: string;
  businessName: string;
  legalName: string;
  categorySlug: string;
  city: string;
  province: string;
  moq: number;
  leadDays: number;
  description: string;
  status: SupplierStatus;
  submittedAt: string;
  reviewedAt: string | null;
  /** Newest first. */
  history: { toStatus: SupplierStatus; reason: string; createdAt: string }[];
  documents: { id: string; kind: SupplierDocumentKind; fileName: string; storagePath: string; createdAt: string }[];
};

/** The signed-in supplier's application, or null if they haven't applied yet. */
export async function getMyApplication(): Promise<SupplierApplication | null> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const supabase = await createClient();
  const { data: s, error } = await supabase
    .from("suppliers")
    .select(
      "*, categories(slug), supplier_status_history(to_status, reason, created_at), supplier_documents(id, kind, file_name, storage_path, created_at)",
    )
    .eq("owner_id", user.id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!s) return null;
  return {
    id: s.id,
    businessName: s.business_name,
    legalName: s.legal_name,
    categorySlug: s.categories?.slug ?? "",
    city: s.city,
    province: s.province,
    moq: s.moq,
    leadDays: s.lead_days,
    description: s.description,
    status: s.status,
    submittedAt: s.submitted_at,
    reviewedAt: s.reviewed_at,
    history: s.supplier_status_history
      .map((h) => ({ toStatus: h.to_status, reason: h.reason, createdAt: h.created_at }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    documents: s.supplier_documents
      .map((d) => ({ id: d.id, kind: d.kind, fileName: d.file_name, storagePath: d.storage_path, createdAt: d.created_at }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  };
}

/** The signed-in user's supplier id, or null when they have not applied. Once per request. */
export const mySupplierId = cache(async (): Promise<string | null> => {
  const user = await getSessionUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.from("suppliers").select("id").eq("owner_id", user.id).maybeSingle();
  if (error) throw new Error(error.message);
  return data?.id ?? null;
});

/** Links to the supplier's own uploaded documents, valid for an hour (storage RLS: owner and verifiers only). */
export async function signedDocumentUrls(paths: string[]): Promise<Record<string, string>> {
  if (!paths.length) return {};
  const supabase = await createClient();
  const { data } = await supabase.storage.from("supplier-documents").createSignedUrls(paths, 3600);
  return Object.fromEntries((data ?? []).flatMap((d) => (d.path && d.signedUrl ? [[d.path, d.signedUrl]] : [])));
}

/**
 * What an order is waiting on, for the supplier's lists and work queue. `action` = the supplier must act now.
 * Mirrors the buttons in fulfilment-actions.tsx; the database still checks every step.
 */
export function nextStep(o: Order): { label: string; action: boolean } | null {
  const paid = o.status === "paid" || o.status === "confirmed";
  const ship = o.fulfilmentMode === "courier" ? "Book courier pickup" : o.fulfilmentMode === "buyer_pickup" ? "Mark ready for pickup" : "Mark as handed over";
  if (paid && o.custom && !o.proofApprovedAt) {
    const last = o.proofs.at(-1);
    if (!o.artwork.length) return { label: "Waiting for the buyer's artwork", action: false };
    if (last?.status === "sent") return { label: "Waiting for the buyer to review the proof", action: false };
    return { label: last ? "Send a revised proof" : "Send proof", action: true };
  }
  if (paid && o.custom) return { label: "Start production", action: true };
  if (paid || o.status === "in_production") return o.shipment ? null : { label: ship, action: true };
  if (o.status === "shipped" && o.fulfilmentMode !== "courier") {
    return o.deliveryClaimedAt
      ? { label: "Waiting for the buyer to confirm", action: false }
      : { label: o.fulfilmentMode === "buyer_pickup" ? "Mark picked up" : "Mark delivered", action: true };
  }
  return null;
}
