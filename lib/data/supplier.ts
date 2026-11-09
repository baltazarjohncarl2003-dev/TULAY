import "server-only";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

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
  documents: { id: string; kind: SupplierDocumentKind; fileName: string; createdAt: string }[];
};

/** The signed-in supplier's application, or null if they haven't applied yet. */
export async function getMyApplication(): Promise<SupplierApplication | null> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const supabase = await createClient();
  const { data: s, error } = await supabase
    .from("suppliers")
    .select(
      "*, categories(slug), supplier_status_history(to_status, reason, created_at), supplier_documents(id, kind, file_name, created_at)",
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
      .map((d) => ({ id: d.id, kind: d.kind, fileName: d.file_name, createdAt: d.created_at }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  };
}
