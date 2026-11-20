import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getSessionUser } from "@/lib/auth";
import type { Profile } from "@/lib/types";
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
    avatarUrl: avatarUrl(p.avatar_path),
  };
}

/** Public URL of a file in the public avatars bucket, or null. */
export function avatarUrl(path: string | null): string | null {
  return path ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/avatars/${path}` : null;
}

/** The signed-in user's profile picture URL, or null. Once per request. */
export const myAvatarUrl = cache(async (): Promise<string | null> => {
  const user = await getSessionUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("avatar_path").eq("id", user.id).single();
  return avatarUrl(data?.avatar_path ?? null);
});
