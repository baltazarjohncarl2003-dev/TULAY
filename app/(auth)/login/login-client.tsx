"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Notice } from "@/components/common";
import { Field, NativeSelect, useServerAction, useServerForm } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { forgotPasswordSchema, signInSchema, signUpSchema } from "@/lib/validation/forms";
import { requestPasswordReset, resendConfirmation, signIn, signUp } from "./actions";

type Mode = "signin" | "signup" | "forgot";

const COPY: Record<Mode, { title: string; blurb: string }> = {
  signin: { title: "Welcome back.", blurb: "Sign in with your email and password." },
  signup: { title: "Let’s get you growing.", blurb: "Create your TULAY account. We’ll email you a link to confirm it." },
  forgot: { title: "Reset your password.", blurb: "Enter your email and we’ll send you a link to set a new password." },
};

const linkClass = "font-medium text-primary underline-offset-4 hover:underline";

export function LoginClient() {
  const params = useSearchParams();
  const mode: Mode = params.get("new") === "1" ? "signup" : params.get("forgot") === "1" ? "forgot" : "signin";
  const role = params.get("role") === "supplier" ? "supplier" : "buyer";
  const next = params.get("next");
  // The email the confirm / reset link went to; set once the server accepted the form.
  const [sentTo, setSentTo] = useState<string | null>(null);
  // Set when sign-in failed because the email is not confirmed yet: offers to send the link again.
  const [unconfirmed, setUnconfirmed] = useState<string | null>(null);
  const keepNext = next ? `next=${encodeURIComponent(next)}` : "";
  const resend = useServerAction();

  const showSent = (action: typeof signUp) => async (raw: Record<string, unknown>) => {
    const res = await action(raw);
    if (res?.ok) setSentTo(String(raw.email ?? "").trim());
    return res;
  };
  const signInForm = useServerForm(
    signInSchema,
    async (raw) => {
      const res = await signIn({ ...raw, next });
      setUnconfirmed(res && !res.ok && res.error.startsWith("Confirm your email") ? String(raw.email ?? "").trim() : null);
      return res;
    },
    "Signed in",
  );
  const signUpForm = useServerForm(signUpSchema, showSent((raw) => signUp({ ...raw, next })), "Check your email");
  const forgotForm = useServerForm(forgotPasswordSchema, showSent(requestPasswordReset), "Check your email");

  return (
    <div className="grid flex-1 gap-6 md:grid-cols-2 md:items-stretch">
      <section className="flex flex-col gap-3 rounded-xl bg-primary p-6 text-primary-foreground sm:p-8">
        <p className="text-title">The bridge to better business.</p>
        <p className="max-w-sm text-sm opacity-90">
          Find suppliers, compare quotes, and build business partnerships in the
          Philippines.
        </p>
      </section>

      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader className="gap-2">
            <h1 className="text-title tracking-tight">{sentTo ? "Check your email." : COPY[mode].title}</h1>
            <CardDescription>
              {sentTo ? (
                <>
                  {mode === "signup"
                    ? "We sent a confirmation link to "
                    : "If an account uses this email, we sent a reset link to "}
                  <strong className="text-foreground">{sentTo}</strong>. Open it to continue.
                </>
              ) : (
                COPY[mode].blurb
              )}
            </CardDescription>
          </CardHeader>

          <CardContent className="flex flex-col gap-4">
            {params.get("suspended") === "1" && <Notice tone="warn">This account is suspended. Contact TULAY support.</Notice>}
            {params.get("link") === "expired" && (
              <Notice tone="warn">That link is invalid or has expired. Sign in, or request a new reset link.</Notice>
            )}

            {sentTo ? (
              <Button variant="outline" className="w-full" onClick={() => setSentTo(null)}>
                Use a different email
              </Button>
            ) : mode === "signin" ? (
              <form onSubmit={signInForm.onSubmit} noValidate className="flex flex-col gap-4">
                <EmailField errors={signInForm.errors} />
                <Field label="Password" name="password" errors={signInForm.errors}>
                  <Input id="password" name="password" type="password" autoComplete="current-password" maxLength={50} />
                </Field>
                <Link href="/login?forgot=1" className={`-mt-2 self-end text-sm ${linkClass}`}>
                  Forgot password?
                </Link>
                <Button type="submit" className="w-full" disabled={signInForm.pending}>
                  Sign in
                </Button>
                {unconfirmed && (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    disabled={resend.pending}
                    onClick={() => resend.run(() => resendConfirmation({ email: unconfirmed }), "Confirmation link sent")}
                  >
                    Send the confirmation link again
                  </Button>
                )}
              </form>
            ) : mode === "signup" ? (
              <form onSubmit={signUpForm.onSubmit} noValidate className="flex flex-col gap-4">
                <Field label="Your full name" name="name" errors={signUpForm.errors}>
                  <Input id="name" name="name" autoComplete="name" maxLength={100} placeholder="e.g. Alex Reyes" />
                </Field>
                <EmailField errors={signUpForm.errors} />
                <NewPasswordFields errors={signUpForm.errors} />
                <Field label="I'm here as a..." name="role" errors={signUpForm.errors}>
                  <NativeSelect id="role" name="role" defaultValue={role}>
                    <option value="buyer">Buyer: source products</option>
                    <option value="supplier">Supplier: find customers</option>
                  </NativeSelect>
                </Field>
                <Field label="" name="acceptTerms" errors={signUpForm.errors}>
                  <label className="flex items-start gap-2 text-sm">
                    <input id="acceptTerms" name="acceptTerms" type="checkbox" className="mt-1 size-4 accent-primary" />
                    <span>
                      I agree to the{" "}
                      <Link href="/terms" target="_blank" className={linkClass}>
                        Terms
                      </Link>{" "}
                      and the{" "}
                      <Link href="/privacy" target="_blank" className={linkClass}>
                        Privacy Policy
                      </Link>
                      .
                    </span>
                  </label>
                </Field>
                <Button type="submit" className="w-full" disabled={signUpForm.pending}>
                  Create account
                </Button>
              </form>
            ) : (
              <form onSubmit={forgotForm.onSubmit} noValidate className="flex flex-col gap-4">
                <EmailField errors={forgotForm.errors} />
                <Button type="submit" className="w-full" disabled={forgotForm.pending}>
                  Send reset link
                </Button>
              </form>
            )}

            <p className="text-sm">
              {mode === "signin" ? (
                <>
                  New to TULAY?{" "}
                  <Link href={`/register${keepNext ? `?${keepNext}` : ""}`} className={linkClass}>
                    Create an account
                  </Link>
                </>
              ) : (
                <>
                  {mode === "signup" ? "Already have an account? " : "Remembered it? "}
                  <Link href={`/login${keepNext ? `?${keepNext}` : ""}`} className={linkClass}>
                    Sign in
                  </Link>
                </>
              )}
            </p>
          </CardContent>

          <CardFooter>
            <p className="text-xs text-muted-foreground">
              Suppliers must pass review before receiving RFQ invitations.
            </p>
          </CardFooter>
        </Card>

        {process.env.NODE_ENV !== "production" && (
          <div className="rounded-lg border border-dashed p-4 text-sm">
            <p className="font-medium">Local test accounts</p>
            <p className="mt-1 text-muted-foreground">
              buyer@tulay.test, supplier@tulay.test, admin@tulay.test, password Tulay1234. Confirm and reset emails
              arrive in Mailpit at http://127.0.0.1:54424.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

type Errors = Record<string, string[] | undefined>;

function EmailField({ errors }: { errors: Errors }) {
  return (
    <Field label="Your business email" name="email" errors={errors}>
      <Input id="email" name="email" type="email" autoComplete="email" placeholder="you@business.com" />
    </Field>
  );
}

/** Password + confirm, shared with the reset-password page. */
export function NewPasswordFields({ errors }: { errors: Errors }) {
  return (
    <>
      <Field label="Password" name="password" errors={errors}>
        <Input id="password" name="password" type="password" autoComplete="new-password" maxLength={50} />
      </Field>
      <p className="-mt-2 text-xs text-muted-foreground">8 to 50 characters, with at least one letter and one number.</p>
      <Field label="Confirm password" name="confirmPassword" errors={errors}>
        <Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" maxLength={50} />
      </Field>
    </>
  );
}
