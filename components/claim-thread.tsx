"use client";

import { useState } from "react";
import { z } from "zod";
import { Field, useServerForm } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { addClaimMessage } from "@/lib/actions/claims";
import { date } from "@/lib/format";
import { cn } from "@/lib/utils";

const messageSchema = z.object({
  body: z.string().trim().min(1, "Write a message").max(2000, "Messages are 1 to 2000 characters"),
});

/** Message thread for a claim. Shared by buyer, supplier and admin pages, so the props stay generic. */
export function ClaimThread({
  claimId,
  messages,
  viewerId,
  names,
  closed,
}: {
  claimId: string;
  messages: { id: string; senderId: string; body: string; createdAt: string }[];
  viewerId: string;
  /** senderId -> display name; anyone not listed shows as "TULAY support". */
  names: Record<string, string>;
  closed?: boolean;
}) {
  // Remounting the form clears the textarea after a successful send.
  const [formKey, setFormKey] = useState(0);
  const { errors, onSubmit, pending } = useServerForm(
    messageSchema,
    (raw) => addClaimMessage(claimId, String(raw.body ?? "")),
    "Message sent",
    () => setFormKey((k) => k + 1),
  );

  return (
    <div className="flex flex-col gap-4">
      {messages.length ? (
        <ul className="flex flex-col gap-3">
          {messages.map((m) => {
            const mine = m.senderId === viewerId;
            return (
              <li key={m.id} className={cn("flex max-w-[85%] flex-col gap-1", mine ? "ml-auto items-end" : "items-start")}>
                <span className="text-xs text-muted-foreground">
                  {names[m.senderId] ?? "TULAY support"} · {date(m.createdAt)}
                </span>
                <p
                  className={cn(
                    "rounded-lg px-3 py-2 text-sm whitespace-pre-wrap",
                    mine ? "bg-primary text-primary-foreground" : "bg-muted",
                  )}
                >
                  {m.body}
                </p>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No messages yet.</p>
      )}

      {!closed && (
        <form key={formKey} onSubmit={onSubmit} className="flex flex-col gap-2">
          <Field label="Message" name="body" errors={errors}>
            <Textarea id="body" name="body" maxLength={2000} placeholder="Write to the supplier or TULAY support" />
          </Field>
          <div>
            <Button type="submit" disabled={pending}>
              Send message
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
