"use client";

import { useServerForm } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { newPasswordSchema } from "@/lib/validation/forms";
import { updatePassword } from "../login/actions";
import { NewPasswordFields } from "../login/login-client";

export function ResetPasswordForm() {
  const form = useServerForm(newPasswordSchema, updatePassword, "Password updated");
  return (
    <Card>
      <CardHeader className="gap-2">
        <h1 className="text-title tracking-tight">Set a new password.</h1>
        <CardDescription>You&apos;ll use it the next time you sign in.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.onSubmit} noValidate className="flex flex-col gap-4">
          <NewPasswordFields errors={form.errors} />
          <Button type="submit" className="w-full" disabled={form.pending}>
            Save new password
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
