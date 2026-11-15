import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { RESET_COOKIE } from "@/lib/next-path";
import { Suspense } from "react";
import { getSessionUser } from "@/lib/auth";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata = { title: "Set a new password" };

// Reached from the reset email: /auth/confirm signs the user in, then sends them here.
export default function ResetPasswordPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 py-8 md:py-12">
      <Suspense fallback={null}>
        <Gate />
      </Suspense>
    </main>
  );
}

async function Gate() {
  const user = await getSessionUser();
  // Only right after a reset link (see /auth/confirm); a signed-in session alone cannot change the password.
  if (!user || (await cookies()).get(RESET_COOKIE)?.value !== user.id) redirect("/login?forgot=1&link=expired");
  return <ResetPasswordForm />;
}
