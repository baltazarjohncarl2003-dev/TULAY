"use client";

import Link from "next/link";
import { StatusPill } from "@/components/common";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, useServerForm } from "@/components/form";
import { saveProfile } from "@/lib/actions/account";
import type { Profile, Role } from "@/lib/demo/types";
import { date } from "@/lib/format";
import { accountSchema } from "@/lib/validation/forms";

export function AccountForm({ profile, role }: { profile: Profile; role: Role }) {
  const { errors, onSubmit, pending } = useServerForm(accountSchema, saveProfile, "Profile saved");

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
      <Card>
        <CardContent className="flex flex-col items-center gap-3 text-center">
          <div className="flex size-20 items-center justify-center rounded-full bg-primary text-3xl font-bold text-primary-foreground">
            {profile.name.slice(0, 1).toUpperCase()}
          </div>
          <h2 className="text-lg font-semibold">{profile.name}</h2>
          <p className="text-sm break-all text-muted-foreground">{profile.email}</p>
          <div className="flex flex-wrap justify-center gap-2">
            <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium text-accent-foreground capitalize">
              {role}
            </span>
            <StatusPill status={profile.status} />
          </div>
          <div className="w-full border-t pt-4 text-sm text-muted-foreground">
            <p>
              {profile.updatedAt ? `Last updated: ${date(profile.updatedAt)}` : "Verified email sign-in enabled"}
            </p>
            <p className="mt-2">Your account type and sign-in email cannot be changed here.</p>
          </div>
          {role === "supplier" && (
            <Link href="/supplier/profile" className={buttonVariants({ variant: "outline" })}>
              Manage company verification
            </Link>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Personal and business details</CardTitle>
          <CardDescription>These details are private and are not published to suppliers.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} noValidate className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name" name="name" errors={errors}>
              <Input id="name" name="name" autoComplete="name" defaultValue={profile.name} required />
            </Field>
            <Field label="Verified email (read-only)" name="email">
              <Input id="email" type="email" value={profile.email} readOnly />
            </Field>
            <Field label="Contact mobile" name="phone" errors={errors}>
              <Input id="phone" name="phone" type="tel" placeholder="09XXXXXXXXX" defaultValue={profile.phone} />
            </Field>
            <Field label="Business / store name" name="businessName" errors={errors}>
              <Input id="businessName" name="businessName" placeholder="Optional for individual buyers" defaultValue={profile.businessName} />
            </Field>
            <Field label="Industry" name="industry" errors={errors}>
              <Input id="industry" name="industry" placeholder="e.g. Food and beverage" defaultValue={profile.industry} />
            </Field>
            <Field label="City / municipality" name="city" errors={errors}>
              <Input id="city" name="city" placeholder="e.g. Quezon City" defaultValue={profile.city} />
            </Field>
            <Field label="Province / region" name="province" errors={errors}>
              <Input id="province" name="province" placeholder="e.g. Metro Manila" defaultValue={profile.province} />
            </Field>
            <Field label="Business website (HTTPS)" name="website" errors={errors}>
              <Input id="website" name="website" type="url" placeholder="https://" defaultValue={profile.website} />
            </Field>
            <Field label="About your business (optional)" name="about" errors={errors} className="sm:col-span-2">
              <Textarea id="about" name="about" placeholder="Describe your business and sourcing interests" defaultValue={profile.about} />
            </Field>
            <div className="flex flex-col gap-2 sm:col-span-2 sm:flex-row sm:items-center sm:justify-between">
              <Button type="submit" disabled={pending}>Save profile</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
