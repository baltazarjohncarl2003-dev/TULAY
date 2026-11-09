"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Field, NativeSelect, useDemoForm } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CONTACT_TOPICS, contactSchema } from "@/lib/validation/forms";

export function ContactForm() {
  const { errors, onSubmit } = useDemoForm(contactSchema, "Message sent. We'll reply by email.");
  const param = useSearchParams().get("topic");
  // ?topic=privacy opens on the first privacy request type.
  const initial = param === "privacy" ? "privacy_access" : param && param in CONTACT_TOPICS ? param : "general";

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4 rounded-xl border bg-card p-5">
      <Field label="What is this about?" name="topic" errors={errors}>
        <NativeSelect id="topic" name="topic" defaultValue={initial}>
          {Object.entries(CONTACT_TOPICS).map(([value, text]) => (
            <option key={value} value={value}>
              {text}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" name="name" errors={errors}>
          <Input id="name" name="name" autoComplete="name" maxLength={100} />
        </Field>
        <Field label="Email" name="email" errors={errors}>
          <Input id="email" name="email" type="email" autoComplete="email" />
        </Field>
      </div>
      <Field label="Order or RFQ reference (optional)" name="reference" errors={errors}>
        <Input id="reference" name="reference" maxLength={60} placeholder="e.g. RFQ-2026-0001" />
      </Field>
      <Field
        label="Message"
        name="message"
        errors={errors}
        hint="For privacy requests, tell us what you need. We verify your identity before releasing or changing data."
      >
        <Textarea id="message" name="message" maxLength={2000} rows={5} />
      </Field>
      <div className="flex flex-col gap-1.5">
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="privacyAck" className="mt-0.5 size-4 accent-primary" />
          <span>
            I have read the <Link href="/privacy" className="text-primary underline">privacy policy</Link>. TULAY will use
            these details only to answer this message.
          </span>
        </label>
        {errors.privacyAck?.[0] && (
          <p className="text-xs text-destructive" role="alert">
            {errors.privacyAck[0]}
          </p>
        )}
      </div>
      <Button type="submit" className="w-fit">
        Send message
      </Button>
    </form>
  );
}
