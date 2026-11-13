"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Notice } from "@/components/common";
import { Field, NativeSelect, useServerForm } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { loginCodeSchema, loginEmailSchema } from "@/lib/validation/forms";
import { sendCode, verifyCode } from "./actions";

type LoginRole = "buyer" | "supplier";

export function LoginClient() {
  const params = useSearchParams();
  const initialRole: LoginRole = params.get("role") === "supplier" ? "supplier" : "buyer";

  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<LoginRole>(initialRole);

  const suspended = params.get("suspended") === "1";

  // Keep what was typed (email is shown on step 2 and sent with the code); move on once the server sent it.
  const emailForm = useServerForm(
    loginEmailSchema,
    (raw) => {
      setEmail(String(raw.email ?? "").trim());
      setRole(raw.role === "supplier" ? "supplier" : "buyer");
      return sendCode(raw);
    },
    "Verification code sent",
    () => setStep(2),
  );

  const next = params.get("next");
  const codeForm = useServerForm(loginCodeSchema, (raw) => verifyCode({ ...raw, email, next }), "Signed in");

  return (
    <div className="grid flex-1 gap-6 md:grid-cols-2 md:items-stretch">
      <section className="flex flex-col justify-between gap-6 rounded-xl bg-primary p-6 text-primary-foreground sm:p-8">
        <div className="flex flex-col gap-3">
          <span className="text-xs font-semibold tracking-wide uppercase">The TULAY way</span>
          <p className="text-3xl font-bold leading-tight">
            Start small.
            <br />
            Think big.
            <br />
            Grow together.
          </p>
          <p className="max-w-sm text-sm opacity-90">
            Find suppliers, compare quotes, and build business partnerships in the
            Philippines.
          </p>
        </div>
        <p className="text-xs font-semibold tracking-wide uppercase opacity-90">Buy smart. Grow big.</p>
      </section>

      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader className="gap-2">
            <CardDescription className="text-xs font-semibold tracking-wide text-primary uppercase">
              Welcome to TULAY
            </CardDescription>
            {step === 1 ? (
              <>
                <h1 className="text-2xl font-bold tracking-tight">Let&apos;s get you growing.</h1>
                <CardDescription>Access your sourcing workspace with a secure one-time email code.</CardDescription>
              </>
            ) : (
              <>
                <h1 className="text-2xl font-bold tracking-tight">One quick check.</h1>
                <CardDescription>
                  Enter the six-digit code we sent to <strong className="text-foreground">{email}</strong>.
                </CardDescription>
              </>
            )}
          </CardHeader>

          <CardContent className="flex flex-col gap-4">
            {suspended && <Notice tone="warn">This account is suspended. Contact TULAY support.</Notice>}
            {step === 1 ? (
              <div className="flex flex-col gap-4">
                <form onSubmit={emailForm.onSubmit} noValidate className="flex flex-col gap-4">
                  <Field label="Your business email" name="email" errors={emailForm.errors}>
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      placeholder="you@business.com"
                      defaultValue={email}
                    />
                  </Field>
                  <Field label="Your full name (new accounts)" name="name" errors={emailForm.errors}>
                    <Input
                      id="name"
                      name="name"
                      autoComplete="name"
                      maxLength={100}
                      placeholder="e.g. Alex Reyes"
                    />
                  </Field>
                  <Field label="I'm here as a..." name="role" errors={emailForm.errors}>
                    <NativeSelect id="role" name="role" defaultValue={role}>
                      <option value="buyer">Buyer: source products</option>
                      <option value="supplier">Supplier: find customers</option>
                    </NativeSelect>
                  </Field>
                  <Button type="submit" className="w-full" disabled={emailForm.pending}>
                    Send my verification code
                  </Button>
                </form>
              </div>
            ) : (
              <form onSubmit={codeForm.onSubmit} noValidate className="flex flex-col gap-4">
                <Field label="Six-digit verification code" name="code" errors={codeForm.errors}>
                  <Input
                    id="code"
                    name="code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    placeholder="000000"
                    className="text-center text-lg tracking-[0.4em]"
                  />
                </Field>
                <Button type="submit" className="w-full" disabled={codeForm.pending}>
                  Verify and continue
                </Button>
                <Button type="button" variant="outline" className="w-full" onClick={() => setStep(1)}>
                  Use a different email
                </Button>
              </form>
            )}
          </CardContent>

          <CardFooter>
            <p className="text-xs text-muted-foreground">
              Secure one-time code sign-in. Suppliers must pass review before receiving RFQ invitations.
            </p>
          </CardFooter>
        </Card>

        {process.env.NODE_ENV !== "production" && (
          <div className="rounded-lg border border-dashed p-4 text-sm">
            <p className="font-medium">Local test accounts</p>
            <p className="mt-1 text-muted-foreground">
              buyer@tulay.test, supplier@tulay.test, admin@tulay.test. Codes arrive in Mailpit at http://127.0.0.1:54424.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
