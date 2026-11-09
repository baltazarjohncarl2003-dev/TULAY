"use client";

import Image from "next/image";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Field, useServerForm } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { loginCodeSchema } from "@/lib/validation/forms";
import { enrollTotp, verifyTotp } from "./actions";

type Enrolment = { factorId: string; qrCode: string; secret: string };

/** `factorId` is the admin's verified authenticator, or null when none is set up yet. */
export function MfaClient({ factorId }: { factorId: string | null }) {
  const [enrolment, setEnrolment] = useState<Enrolment | null>(null);
  const [starting, startTransition] = useTransition();
  const activeFactor = factorId ?? enrolment?.factorId ?? null;
  const form = useServerForm(loginCodeSchema, (raw) => verifyTotp({ ...raw, factorId: activeFactor }), "Verified");

  function startEnrolment() {
    startTransition(async () => {
      const res = await enrollTotp();
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setEnrolment({ factorId: res.factorId, qrCode: res.qrCode, secret: res.secret });
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Two-step verification</CardTitle>
        <CardDescription>
          {factorId
            ? "Enter the 6-digit code from your authenticator app to open the admin area."
            : "Admin accounts need an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password...)."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!activeFactor && (
          <Button onClick={startEnrolment} disabled={starting}>
            Set up authenticator app
          </Button>
        )}
        {enrolment && (
          <div className="flex flex-col items-center gap-2 text-center text-sm">
            <p>Scan this code with your authenticator app, then enter the 6-digit code it shows.</p>
            <Image src={enrolment.qrCode} alt="Authenticator QR code" width={180} height={180} unoptimized />
            <p className="text-muted-foreground">
              Can&apos;t scan? Enter this key: <code className="break-all text-foreground">{enrolment.secret}</code>
            </p>
          </div>
        )}
        {activeFactor && (
          <form onSubmit={form.onSubmit} noValidate className="flex flex-col gap-4">
            <Field label="Six-digit code" name="code" errors={form.errors}>
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
            <Button type="submit" disabled={form.pending}>
              Verify and continue
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
