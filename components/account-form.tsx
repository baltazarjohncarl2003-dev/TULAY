"use client";

import Link from "next/link";
import { StatusPill } from "@/components/common";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, useServerForm } from "@/components/form";
import { saveProfile } from "@/lib/actions/account";
import type { Profile, Role } from "@/lib/types";
import { date } from "@/lib/format";
import { accountSchema } from "@/lib/validation/forms";

const COMPLETION_FIELDS: [keyof Profile, string][] = [
  ["phone", "contact mobile"],
  ["businessName", "business name"],
  ["industry", "industry"],
  ["city", "city"],
  ["province", "province"],
  ["about", "about"],
];

export function profileCompletion(p: Profile) {
  const missing = COMPLETION_FIELDS.filter(([key]) => !String(p[key] ?? "").trim()).map(([, label]) => label);
  const total = COMPLETION_FIELDS.length;
  const done = total - missing.length;
  return { done, total, pct: Math.round((done * 100) / total), missing };
}

export function AccountForm({
  profile,
  role,
  section = "all",
}: {
  profile: Profile;
  role: Role;
  section?: "all" | "personal" | "business";
}) {
  const { errors, onSubmit, pending } = useServerForm(accountSchema, saveProfile, "Profile saved");
  const completion = profileCompletion(profile);
  // The saver updates every column, so fields hidden in this section are re-sent as hidden inputs.
  const personal = section !== "business";
  const business = section !== "personal";
  const copy = {
    all: { title: "Personal and business details", submit: "Save profile" },
    personal: { title: "Personal details", submit: "Save details" },
    business: { title: "Business profile", submit: "Save business profile" },
  }[section];
  const heading = section === "business" ? profile.businessName || profile.name : profile.name;

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
      <Card>
        <CardContent className="flex flex-col items-center gap-3 text-center">
          <div className="flex size-20 items-center justify-center rounded-full bg-primary text-3xl font-bold text-primary-foreground">
            {profile.name.slice(0, 1).toUpperCase()}
          </div>
          <h2 className="text-lg font-semibold">{heading}</h2>
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
          <div className="w-full text-left text-sm">
            <p id="profile-completion-label" className="font-medium">Profile {completion.pct}% complete</p>
            <progress
              aria-labelledby="profile-completion-label"
              max={completion.total}
              value={completion.done}
              className="mt-1 h-2 w-full"
            />
            {completion.missing.length > 0 && (
              <p className="mt-1 text-muted-foreground">Add: {completion.missing.join(", ")}</p>
            )}
          </div>
          {role === "supplier" && (
            <Link href="/supplier/profile" className={buttonVariants({ variant: "outline" })}>
              Manage company verification
            </Link>
          )}
          {role === "buyer" && section === "personal" && (
            <Link href="/buyer/profile" className={buttonVariants({ variant: "outline" })}>
              Edit business profile
            </Link>
          )}
          {role === "buyer" && section === "business" && (
            <Link href="/buyer/account" className={buttonVariants({ variant: "outline" })}>
              Edit personal details
            </Link>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{copy.title}</CardTitle>
          <CardDescription>
            {section === "business" ? (
              "Suppliers you order from or select in an RFQ see your business name and location so they can quote and fulfil the order."
            ) : (
              <>
                Suppliers you order from or select in an RFQ see your name, business name, email and mobile number so they
                can fulfil the order. Nobody else sees them. See our{" "}
                <Link href="/privacy" className="text-primary underline">
                  privacy notice
                </Link>
                .
              </>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} noValidate className="grid gap-4 sm:grid-cols-2">
            {personal ? (
              <Field label="Full name" name="name" errors={errors}>
                <Input id="name" name="name" autoComplete="name" defaultValue={profile.name} required />
              </Field>
            ) : (
              <input type="hidden" name="name" value={profile.name} />
            )}
            {personal && (
              <Field label="Verified email (read-only)" name="email">
                <Input id="email" type="email" value={profile.email} readOnly />
              </Field>
            )}
            {personal ? (
              <Field label="Contact mobile" name="phone" errors={errors}>
                <Input id="phone" name="phone" type="tel" placeholder="09XXXXXXXXX" defaultValue={profile.phone} />
              </Field>
            ) : (
              <input type="hidden" name="phone" value={profile.phone} />
            )}
            {business ? (
              <Field label="Business / store name" name="businessName" errors={errors}>
                <Input id="businessName" name="businessName" placeholder="Optional for individual buyers" defaultValue={profile.businessName} />
              </Field>
            ) : (
              <input type="hidden" name="businessName" value={profile.businessName} />
            )}
            {business ? (
              <Field label="Industry" name="industry" errors={errors}>
                <Input id="industry" name="industry" placeholder="e.g. Food and beverage" defaultValue={profile.industry} />
              </Field>
            ) : (
              <input type="hidden" name="industry" value={profile.industry} />
            )}
            {business ? (
              <Field label="City / municipality" name="city" errors={errors}>
                <Input id="city" name="city" placeholder="e.g. Quezon City" defaultValue={profile.city} />
              </Field>
            ) : (
              <input type="hidden" name="city" value={profile.city} />
            )}
            {business ? (
              <Field label="Province / region" name="province" errors={errors}>
                <Input id="province" name="province" placeholder="e.g. Metro Manila" defaultValue={profile.province} />
              </Field>
            ) : (
              <input type="hidden" name="province" value={profile.province} />
            )}
            {business ? (
              <Field label="Business website (HTTPS)" name="website" errors={errors}>
                <Input id="website" name="website" type="url" placeholder="https://" defaultValue={profile.website} />
              </Field>
            ) : (
              <input type="hidden" name="website" value={profile.website} />
            )}
            {business ? (
              <Field label="About your business (optional)" name="about" errors={errors} className="sm:col-span-2">
                <Textarea id="about" name="about" placeholder="Describe your business and sourcing interests" defaultValue={profile.about} />
              </Field>
            ) : (
              <input type="hidden" name="about" value={profile.about} />
            )}
            <div className="flex flex-col gap-2 sm:col-span-2 sm:flex-row sm:items-center sm:justify-between">
              <Button type="submit" disabled={pending}>{copy.submit}</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
