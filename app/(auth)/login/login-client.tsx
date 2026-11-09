"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Field, NativeSelect, demoAction, useDemoForm } from "@/components/form";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { loginCodeSchema, loginEmailSchema } from "@/lib/validation/forms";

type LoginRole = "buyer" | "supplier";

export function LoginClient() {
  const router = useRouter();
  const params = useSearchParams();
  const initialRole: LoginRole = params.get("role") === "supplier" ? "supplier" : "buyer";

  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<LoginRole>(initialRole);

  const emailForm = useDemoForm(loginEmailSchema, "Verification code sent", (data) => {
    setEmail(data.email);
    setRole(data.role);
    setStep(2);
  });

  const codeForm = useDemoForm(loginCodeSchema, "Signed in", () => {
    router.push(role === "buyer" ? "/buyer" : "/supplier");
  });

  return (
    <div className="grid flex-1 gap-6 md:grid-cols-2 md:items-stretch">
      <section className="flex flex-col justify-between gap-6 rounded-xl bg-primary p-6 text-primary-foreground sm:p-8">
        <div className="flex flex-col gap-3">
          <span className="text-xs font-semibold tracking-wide uppercase">The TULAY way</span>
          <h2 className="text-3xl font-bold leading-tight">
            Start small.
            <br />
            Think big.
            <br />
            Grow together.
          </h2>
          <p className="max-w-sm text-sm opacity-90">
            Find custom print and packaging suppliers, compare quotes, and build business partnerships in the
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

          <CardContent>
            {step === 1 ? (
              <div className="flex flex-col gap-4">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => demoAction("Google sign-in arrives in Stage 1")}
                >
                  Continue with Google
                </Button>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="h-px flex-1 bg-border" />
                  or
                  <span className="h-px flex-1 bg-border" />
                </div>
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
                  <Button type="submit" className="w-full">
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
                <Button type="submit" className="w-full">
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

        <div className="rounded-lg border border-dashed p-4">
          <p className="text-sm font-medium">Demo shortcuts</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Link href="/buyer" className={buttonVariants({ variant: "outline", size: "sm" })}>
              Buyer dashboard
            </Link>
            <Link href="/supplier" className={buttonVariants({ variant: "outline", size: "sm" })}>
              Supplier dashboard
            </Link>
            <Link href="/admin" className={buttonVariants({ variant: "outline", size: "sm" })}>
              Admin
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
