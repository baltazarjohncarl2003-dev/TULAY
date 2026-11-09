import { Suspense } from "react";
import { LoginClient } from "./login-client";

export const metadata = { title: "Log in" };

export default function LoginPage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-8 md:py-12">
      <Suspense fallback={null}>
        <LoginClient />
      </Suspense>
    </main>
  );
}
