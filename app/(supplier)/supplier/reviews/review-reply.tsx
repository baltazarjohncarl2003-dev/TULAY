"use client";

import { z } from "zod";
import { useServerForm } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { replyReview } from "@/lib/actions/claims";

const replySchema = z.object({
  reply: z.string().trim().min(1, "Write a reply.").max(1000, "Keep the reply to 1000 characters or fewer."),
});

/** One reply per review. The server enforces the once-only rule. */
export function ReviewReply({ reviewId }: { reviewId: string }) {
  const { errors, onSubmit, pending } = useServerForm(
    replySchema,
    (raw) => replyReview(reviewId, String(raw.reply).trim()),
    "Reply posted",
  );
  // Field ties its label to the name, which repeats on every review; use a per-review id instead.
  const id = `reply-${reviewId}`;
  const err = errors.reply?.[0];

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-2">
      <Label htmlFor={id}>Reply</Label>
      <Textarea id={id} name="reply" rows={3} maxLength={1000} />
      {err && (
        <p className="text-xs text-destructive" role="alert">
          {err}
        </p>
      )}
      <p className="text-xs text-muted-foreground">You can reply once.</p>
      <div>
        <Button type="submit" size="sm" disabled={pending}>
          Reply
        </Button>
      </div>
    </form>
  );
}
