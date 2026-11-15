import { redirect } from "next/navigation";
import { Suspense } from "react";
import { LoginClient } from "./login-client";
import { getSessionUser, homeFor } from "@/lib/auth";

export const metadata = { title: "Sign in" };

async function Gate() {
  const user = await getSessionUser();
  if (user?.status === "active") redirect(homeFor(user.role));
  return <LoginClient />;
}

export default function LoginPage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-8 md:py-12">
      <Suspense fallback={null}>
        <Gate />
      </Suspense>
    </main>
  );
}
