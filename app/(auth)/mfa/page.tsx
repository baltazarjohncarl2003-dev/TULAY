import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getSessionUser, homeFor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { MfaClient } from "./mfa-client";

export const metadata = { title: "Two-step verification" };

export default function MfaPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 py-8 md:py-12">
      <Suspense fallback={null}>
        <MfaGate />
      </Suspense>
    </main>
  );
}

/** Admins must pass an authenticator-app check every session before the admin area opens. */
async function MfaGate() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect(homeFor(user.role));
  if (user.aal === "aal2") redirect("/admin");
  const supabase = await createClient();
  const { data } = await supabase.auth.mfa.listFactors();
  return <MfaClient factorId={data?.totp[0]?.id ?? null} />;
}
