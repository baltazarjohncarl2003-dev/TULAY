import "server-only";
import { requireRole } from "@/lib/auth";
import type { Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import type { SupplierDocumentKind, SupplierStatus } from "@/lib/data/supplier";

// Every loader re-checks the admin session; RLS (sub-role + MFA) decides which rows come back.

export type AdminSupplierRow = {
  id: string;
  businessName: string;
  legalName: string;
  categoryName: string;
  city: string;
  province: string;
  moq: number;
  leadDays: number;
  description: string;
  status: SupplierStatus;
  submittedAt: string;
  ownerName: string;
  ownerEmail: string;
  /** `url` is a 5-minute signed link, or null when this admin has no verifier role. */
  documents: { id: string; kind: SupplierDocumentKind; fileName: string; url: string | null }[];
};

const REVIEW_FIRST: SupplierStatus[] = ["pending", "under_review"];
const SIGNED_URL_SECONDS = 300;

export async function listSupplierApplications(): Promise<AdminSupplierRow[]> {
  await requireRole("admin");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("suppliers")
    .select("*, categories(name), profiles(full_name, email), supplier_documents(id, kind, file_name, storage_path)")
    .order("submitted_at", { ascending: true });
  if (error) throw new Error(error.message);

  const paths = data.flatMap((s) => s.supplier_documents.map((d) => d.storage_path));
  const urls = new Map<string, string>();
  if (paths.length) {
    const { data: signed } = await supabase.storage.from("supplier-documents").createSignedUrls(paths, SIGNED_URL_SECONDS);
    for (const s of signed ?? []) if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl);
  }

  return data
    .map((s) => ({
      id: s.id,
      businessName: s.business_name,
      legalName: s.legal_name,
      categoryName: s.categories?.name ?? "",
      city: s.city,
      province: s.province,
      moq: s.moq,
      leadDays: s.lead_days,
      description: s.description,
      status: s.status,
      submittedAt: s.submitted_at,
      ownerName: s.profiles?.full_name ?? "",
      ownerEmail: s.profiles?.email ?? "",
      documents: s.supplier_documents.map((d) => ({
        id: d.id,
        kind: d.kind,
        fileName: d.file_name,
        url: urls.get(d.storage_path) ?? null,
      })),
    }))
    .sort((a, b) => Number(REVIEW_FIRST.includes(b.status)) - Number(REVIEW_FIRST.includes(a.status)));
}

export type SettingRow = { key: string; value: Json; description: string; updatedAt: string };

export async function listSettings(): Promise<SettingRow[]> {
  await requireRole("admin");
  const supabase = await createClient();
  const { data, error } = await supabase.from("platform_settings").select("*").order("key");
  if (error) throw new Error(error.message);
  return data.map((s) => ({ key: s.key, value: s.value, description: s.description, updatedAt: s.updated_at }));
}

export type CommissionRow = { id: string; categoryName: string | null; rateBps: number; startsAt: string; note: string };

export async function listCommissionSchedules(): Promise<CommissionRow[]> {
  await requireRole("admin");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("commission_schedules")
    .select("*, categories(name)")
    .order("starts_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data.map((c) => ({
    id: c.id,
    categoryName: c.categories?.name ?? null,
    rateBps: c.rate_bps,
    startsAt: c.starts_at,
    note: c.note,
  }));
}

export type AuditRow = {
  id: number;
  actorId: string | null;
  action: string;
  targetTable: string;
  targetId: string;
  details: Json;
  createdAt: string;
};

/** Latest 100 entries. Only super admins get rows back (RLS). */
export async function listAuditLog(): Promise<AuditRow[]> {
  await requireRole("admin");
  const supabase = await createClient();
  const { data, error } = await supabase.from("audit_log").select("*").order("created_at", { ascending: false }).limit(100);
  if (error) throw new Error(error.message);
  return data.map((a) => ({
    id: a.id,
    actorId: a.actor_id,
    action: a.action,
    targetTable: a.target_table,
    targetId: a.target_id,
    details: a.details,
    createdAt: a.created_at,
  }));
}
