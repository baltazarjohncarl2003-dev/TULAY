import "server-only";
import { z } from "zod";
import { canAdmin, requireRole, type AdminSubRole, type SessionUser } from "@/lib/auth";
import { mediaUrl } from "@/lib/data/catalog";
import type { ListParams, Paged } from "@/lib/data/admin-money";
import type { Database, Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import type { SupplierDocumentKind, SupplierStatus } from "@/lib/data/supplier";

// Every loader re-checks the admin session; RLS (sub-role + MFA) decides which rows come back.

const PAGE_SIZE = 20;
const SIGNED_URL_SECONDS = 300;

/** A page of rows; `pages` is at least 1. */
function paged<T>(rows: T[], total: number | null, page: number, size = PAGE_SIZE): Paged<T> {
  return { rows, total: total ?? 0, page, pages: Math.max(1, Math.ceil((total ?? 0) / size)) };
}
function fail(error: { message: string }): never {
  throw new Error(error.message);
}
/** Ids as a PostgREST in-list. Ids come from the database, never from the browser. */
const inList = (ids: string[]) => `(${ids.join(",")})`;

// ---------------------------------------------------------------- suppliers (A-17)

export type SupplierHistoryRow = { toStatus: SupplierStatus; reason: string; createdAt: string };

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
  /** Earlier status changes that carry a reason (for example a rejection), newest first. */
  history: SupplierHistoryRow[];
};

/** Tabs for the supplier list. The empty status is the review queue (pending + under review). */
export const SUPPLIER_TABS = ["pending", "under_review", "verified", "rejected", "suspended", "restricted", "all"] as const;

/** One page of applications. Only the shown page gets signed document links. */
export async function listSupplierApplications(p: ListParams): Promise<Paged<AdminSupplierRow>> {
  await requireRole("admin");
  const supabase = await createClient();
  const from = (p.page - 1) * PAGE_SIZE;
  const queue = !p.status || p.status === "pending" || p.status === "under_review";
  let query = supabase
    .from("suppliers")
    .select(
      "*, categories(name), profiles(full_name, email), supplier_documents(id, kind, file_name, storage_path), supplier_status_history(to_status, reason, created_at)",
      { count: "exact" },
    )
    .order("submitted_at", { ascending: queue })
    .range(from, from + PAGE_SIZE - 1);
  if (!p.status) query = query.in("status", ["pending", "under_review"]);
  else if (p.status !== "all") query = query.eq("status", p.status as SupplierStatus);
  if (p.q) query = query.or(`business_name.ilike.%${p.q}%,legal_name.ilike.%${p.q}%`);
  const { data, error, count } = await query;
  if (error) fail(error);
  const rows = data ?? [];

  const paths = rows.flatMap((s) => s.supplier_documents.map((d) => d.storage_path));
  const urls = new Map<string, string>();
  if (paths.length) {
    const { data: signed } = await supabase.storage.from("supplier-documents").createSignedUrls(paths, SIGNED_URL_SECONDS);
    for (const s of signed ?? []) if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl);
  }

  return paged(
    rows.map((s) => ({
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
      history: s.supplier_status_history
        .filter((h) => h.reason)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .map((h) => ({ toStatus: h.to_status, reason: h.reason, createdAt: h.created_at })),
    })),
    count,
    p.page,
  );
}

// ---------------------------------------------------------------- settings

export type SettingRow = { key: string; value: Json; description: string; updatedAt: string };

export async function listSettings(): Promise<SettingRow[]> {
  await requireRole("admin");
  const supabase = await createClient();
  const { data, error } = await supabase.from("platform_settings").select("*").order("key");
  if (error) throw new Error(error.message);
  return data.map((s) => ({ key: s.key, value: s.value, description: s.description, updatedAt: s.updated_at }));
}

export type TermsRow = { returnClass: "standard" | "custom" | "final_sale"; version: number; body: string; updatedAt: string };

/** The terms per return class that new chat agreements copy. */
export async function listTermsTemplates(): Promise<TermsRow[]> {
  await requireRole("admin");
  const supabase = await createClient();
  const { data, error } = await supabase.from("terms_templates").select("return_class, version, body, updated_at").order("return_class");
  if (error) throw new Error(error.message);
  return data.map((t) => ({ returnClass: t.return_class, version: t.version, body: t.body, updatedAt: t.updated_at }));
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

/** Each synonym pair once (the database stores both directions). */
export async function listSearchSynonyms(): Promise<{ term: string; synonym: string }[]> {
  await requireRole("admin");
  const supabase = await createClient();
  const { data, error } = await supabase.from("search_synonyms").select("term, synonym").order("term");
  if (error) fail(error);
  return (data ?? []).filter((r) => r.term < r.synonym);
}

export async function listBannedTerms(): Promise<string[]> {
  await requireRole("admin");
  const supabase = await createClient();
  const { data, error } = await supabase.from("banned_terms").select("term").order("term");
  if (error) fail(error);
  return (data ?? []).map((r) => r.term);
}

// ---------------------------------------------------------------- audit log (A-11)

export type AuditRow = {
  id: number;
  actorId: string | null;
  actorName: string | null;
  action: string;
  targetTable: string;
  targetId: string;
  details: Json;
  createdAt: string;
};

export type AuditFilters = { action: string; target: string; actor: string; from: string; to: string; page: number };

const dateParam = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).catch("");
const auditParams = z.object({
  action: z.string().trim().max(40).catch(""),
  target: z.string().trim().max(60).catch(""),
  actor: z.string().trim().max(80).catch(""),
  from: dateParam,
  to: dateParam,
  page: z.coerce.number().int().min(1).max(100000).catch(1),
});

/** Reads the audit filters from searchParams; free text is cut down to letters, digits and a few separators. */
export function parseAuditFilters(sp: Record<string, string | string[] | undefined>): AuditFilters {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const f = auditParams.parse({
    action: one(sp.action),
    target: one(sp.target),
    actor: one(sp.actor),
    from: one(sp.from),
    to: one(sp.to),
    page: one(sp.page) || 1,
  });
  const clean = (t: string) => t.replace(/[^\p{L}\p{N}@._\- ]/gu, "");
  return { ...f, action: clean(f.action), target: clean(f.target), actor: clean(f.actor) };
}

const AUDIT_PAGE_SIZE = 50;

/** One page of the audit log, newest first, with actor names. Only super admins get rows back (RLS). */
export async function listAuditLog(f: AuditFilters): Promise<Paged<AuditRow>> {
  await requireRole("admin");
  const supabase = await createClient();
  let query = supabase.from("audit_log").select("*", { count: "exact" }).order("created_at", { ascending: false });
  if (f.action) query = query.ilike("action", `%${f.action}%`);
  if (f.target) query = query.eq("target_id", f.target);
  if (f.from) query = query.gte("created_at", `${f.from}T00:00:00+08:00`); // Philippine days
  if (f.to) query = query.lte("created_at", `${f.to}T23:59:59.999+08:00`);
  if (f.actor) {
    const like = `%${f.actor}%`;
    const { data: people } = await supabase.from("profiles").select("id").or(`email.ilike.${like},full_name.ilike.${like}`).limit(50);
    if (!people?.length) return paged([], 0, f.page, AUDIT_PAGE_SIZE);
    query = query.in("actor_id", people.map((x) => x.id));
  }
  const from = (f.page - 1) * AUDIT_PAGE_SIZE;
  const { data, error, count } = await query.range(from, from + AUDIT_PAGE_SIZE - 1);
  if (error) fail(error);
  const rows = data ?? [];

  const actorIds = [...new Set(rows.flatMap((a) => (a.actor_id ? [a.actor_id] : [])))];
  const names = new Map<string, string>();
  if (actorIds.length) {
    const { data: ps } = await supabase.from("profiles").select("id, full_name, email").in("id", actorIds);
    for (const x of ps ?? []) names.set(x.id, x.full_name || x.email);
  }
  return paged(
    rows.map((a) => ({
      id: a.id,
      actorId: a.actor_id,
      actorName: a.actor_id ? (names.get(a.actor_id) ?? null) : null,
      action: a.action,
      targetTable: a.target_table,
      targetId: a.target_id,
      details: a.details,
      createdAt: a.created_at,
    })),
    count,
    f.page,
    AUDIT_PAGE_SIZE,
  );
}

// ---------------------------------------------------------------- products (A-8)

/** Tabs for the product list. The empty status is "pending". */
export const PRODUCT_TABS = ["pending", "approved", "rejected", "all"] as const;

export type AdminProductRow = {
  id: string;
  title: string;
  description: string;
  supplierName: string;
  status: Database["public"]["Enums"]["product_status"];
  moq: number;
  unit: string;
  priceCentavos: number | null;
  returnClass: string;
  submittedAt: string | null;
  reviewNote: string;
  images: string[];
  tiers: { minQty: number; unitPriceCentavos: number }[];
  variants: { name: string; priceDeltaCentavos: number; stock: number | null; active: boolean }[];
};

/** One page of listings (oldest submission first on the pending tab). RLS decides what this admin sees. */
export async function listAdminProducts(p: ListParams): Promise<Paged<AdminProductRow>> {
  await requireRole("admin");
  const supabase = await createClient();
  const status = p.status || "pending";
  const from = (p.page - 1) * PAGE_SIZE;
  let query = supabase
    .from("products")
    .select(
      "id, title, description, status, moq, unit, indicative_price_centavos, return_class, submitted_at, product_media(storage_path, sort_order), price_tiers(min_qty, unit_price_centavos), product_variants(name, price_delta_centavos, stock, active, sort_order), suppliers(business_name)",
      { count: "exact" },
    )
    .neq("status", "draft")
    .order("submitted_at", { ascending: status === "pending", nullsFirst: false })
    .range(from, from + PAGE_SIZE - 1);
  if (status !== "all") query = query.eq("status", status as "pending" | "approved" | "rejected");
  if (p.q) query = query.ilike("title", `%${p.q}%`);
  const { data, error, count } = await query;
  if (error) fail(error);
  const { data: notes, error: notesError } = await supabase.rpc("product_review_notes", { p_ids: (data ?? []).map((x) => x.id) });
  if (notesError) fail(notesError);
  const noteFor = new Map((notes ?? []).map((n) => [n.product_id, n.note]));
  return paged(
    (data ?? []).map((x) => ({
      id: x.id,
      title: x.title,
      description: x.description,
      supplierName: x.suppliers?.business_name ?? "Supplier",
      status: x.status,
      moq: x.moq,
      unit: x.unit,
      priceCentavos: x.indicative_price_centavos,
      returnClass: x.return_class,
      submittedAt: x.submitted_at,
      reviewNote: noteFor.get(x.id) ?? "",
      images: [...x.product_media].sort((a, b) => a.sort_order - b.sort_order).map((m) => mediaUrl(m.storage_path)),
      tiers: [...x.price_tiers]
        .sort((a, b) => a.min_qty - b.min_qty)
        .map((t) => ({ minQty: t.min_qty, unitPriceCentavos: t.unit_price_centavos })),
      variants: [...x.product_variants]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((v) => ({ name: v.name, priceDeltaCentavos: v.price_delta_centavos, stock: v.stock, active: v.active })),
    })),
    count,
    p.page,
  );
}

// ---------------------------------------------------------------- users (A-4)

export const USER_TABS = ["active", "suspended"] as const;

export type AdminUserRow = {
  id: string;
  email: string;
  fullName: string;
  role: Database["public"]["Enums"]["user_role"];
  status: Database["public"]["Enums"]["account_status"];
  createdAt: string;
  /** Business names of the supplier profile this account owns. */
  businesses: string[];
  /** Sub-roles held. Only super admins can read other people's roles, so this is empty for everyone else. */
  subRoles: AdminSubRole[];
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Accounts by email, name, business name or exact id. Support reads all profiles (RLS). */
export async function listAdminUsers(p: ListParams): Promise<Paged<AdminUserRow>> {
  await requireRole("admin");
  const supabase = await createClient();
  const from = (p.page - 1) * PAGE_SIZE;
  let query = supabase
    .from("profiles")
    .select("id, email, full_name, role, status, created_at, business_name", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);
  if (p.status) query = query.eq("status", p.status as "active" | "suspended");
  if (p.q) {
    if (UUID.test(p.q)) query = query.eq("id", p.q);
    else {
      const like = `%${p.q}%`;
      const parts = [`email.ilike.${like}`, `full_name.ilike.${like}`, `business_name.ilike.${like}`];
      const { data: owners } = await supabase.from("suppliers").select("owner_id").ilike("business_name", like).limit(50);
      if (owners?.length) parts.push(`id.in.${inList(owners.map((x) => x.owner_id))}`);
      query = query.or(parts.join(","));
    }
  }
  const { data, error, count } = await query;
  if (error) fail(error);
  const rows = data ?? [];

  const ids = rows.map((r) => r.id);
  const adminIds = rows.filter((r) => r.role === "admin").map((r) => r.id);
  const [{ data: sups }, { data: roles }] = await Promise.all([
    ids.length ? supabase.from("suppliers").select("owner_id, business_name").in("owner_id", ids) : { data: [] },
    adminIds.length ? supabase.from("admin_roles").select("user_id, sub_role").in("user_id", adminIds) : { data: [] },
  ]);
  return paged(
    rows.map((r) => ({
      id: r.id,
      email: r.email,
      fullName: r.full_name,
      role: r.role,
      status: r.status,
      createdAt: r.created_at,
      businesses: (sups ?? []).filter((x) => x.owner_id === r.id).map((x) => x.business_name),
      subRoles: (roles ?? []).filter((x) => x.user_id === r.id).map((x) => x.sub_role),
    })),
    count,
    p.page,
  );
}

// ---------------------------------------------------------------- work queue (A-12)

export type WorkItem = { key: string; count: number; singular: string; plural: string; href: string };

/** What is waiting for this admin: count-only queries, each only for the sub-roles that can act on it. */
export async function adminWorkQueue(user: Pick<SessionUser, "subRoles">): Promise<WorkItem[]> {
  await requireRole("admin");
  const supabase = await createClient();
  const head = { count: "exact", head: true } as const;
  const n = async (q: PromiseLike<{ count: number | null }>) => (await q).count ?? 0;
  const [suppliers, products, rfqs, claims, payments, payouts, messages] = await Promise.all([
    canAdmin(user, "verifier") ? n(supabase.from("suppliers").select("id", head).in("status", ["pending", "under_review"])) : 0,
    canAdmin(user, "verifier") ? n(supabase.from("products").select("id", head).eq("status", "pending")) : 0,
    canAdmin(user, "support") ? n(supabase.from("rfqs").select("id", head).eq("status", "under_review")) : 0,
    canAdmin(user, "support") ? n(supabase.from("claims").select("id", head).eq("status", "escalated")) : 0,
    canAdmin(user, "finance", "support") ? n(supabase.from("payments").select("id", head).eq("status", "needs_review")) : 0,
    canAdmin(user, "finance") ? n(supabase.from("payouts").select("id", head).eq("status", "scheduled")) : 0,
    canAdmin(user, "support") ? n(supabase.from("contact_messages").select("id", head).is("handled_at", null)) : 0,
  ]);
  return [
    { key: "suppliers", count: suppliers, singular: "supplier to review", plural: "suppliers to review", href: "/admin/suppliers" },
    { key: "products", count: products, singular: "listing to review", plural: "listings to review", href: "/admin/products" },
    { key: "rfqs", count: rfqs, singular: "request to review", plural: "requests to review", href: "/admin/rfqs" },
    { key: "claims", count: claims, singular: "escalated claim", plural: "escalated claims", href: "/admin/claims" },
    { key: "payments", count: payments, singular: "payment to check", plural: "payments to check", href: "/admin/payments" },
    { key: "payouts", count: payouts, singular: "scheduled payout", plural: "scheduled payouts", href: "/admin/payouts" },
    { key: "messages", count: messages, singular: "open contact message", plural: "open contact messages", href: "/admin/messages" },
  ];
}

// ---------------------------------------------------------------- contact inbox and claim threads (A-23)

export type ContactMessageRow = {
  id: string;
  topic: string;
  name: string;
  email: string;
  reference: string;
  message: string;
  userId: string | null;
  handledAt: string | null;
  createdAt: string;
};

/** Latest 100 contact messages, open first. Support only (RLS). */
export async function listContactMessages(): Promise<ContactMessageRow[]> {
  await requireRole("admin");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contact_messages")
    .select("id, topic, name, email, reference, message, user_id, handled_at, created_at")
    .order("handled_at", { ascending: false, nullsFirst: true })
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) fail(error);
  return (data ?? []).map((m) => ({
    id: m.id,
    topic: m.topic,
    name: m.name,
    email: m.email,
    reference: m.reference,
    message: m.message,
    userId: m.user_id,
    handledAt: m.handled_at,
    createdAt: m.created_at,
  }));
}

export type ClaimThreadRow = { id: string; ref: string; status: string; updatedAt: string };

/** Claims by latest activity. shortcut: sorted by claim update time, not last message; sort by message time if support needs it. */
export async function listClaimThreads(): Promise<ClaimThreadRow[]> {
  await requireRole("admin");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("claims")
    .select("id, ref, status, updated_at")
    .order("updated_at", { ascending: false })
    .limit(50);
  if (error) fail(error);
  return (data ?? []).map((c) => ({ id: c.id, ref: c.ref, status: c.status, updatedAt: c.updated_at }));
}
