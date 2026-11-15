import { redirect } from "next/navigation";
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
  if (!(await getSessionUser())) redirect("/login?link=expired");
  return <ResetPasswordForm />;
}
