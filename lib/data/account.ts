import "server-only";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import type { Profile } from "@/lib/demo/types";
import { createClient } from "@/lib/supabase/server";

/** The signed-in user's own profile, in the shape the account form already uses. */
export async function getMyProfile(): Promise<Profile> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const supabase = await createClient();
  const { data: p, error } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  if (error || !p) throw new Error("Profile not found");
  return {
    id: p.id,
    name: p.full_name,
    email: p.email,
    role: p.role,
    status: p.status,
    phone: p.phone,
    businessName: p.business_name,
    industry: p.industry,
    city: p.city,
    province: p.province,
    website: p.website,
    about: p.about,
    updatedAt: p.updated_at,
  };
}
