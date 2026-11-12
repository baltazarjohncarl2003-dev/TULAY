"use client";

import { toast } from "sonner";
import { z } from "zod";
import { Field, useServerAction } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { postReview } from "@/lib/actions/claims";

// Instant feedback only; postReview validates again.
const reviewInput = z.object({
  rating: z.coerce.number().int().min(1, "Pick 1 to 5 stars").max(5, "Pick 1 to 5 stars"),
  body: z.string().trim().max(2000, "Keep the review under 2000 characters"),
});

export function ReviewForm({ orderId }: { orderId: string }) {
  const { run, pending } = useServerAction();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const check = reviewInput.safeParse({ rating: fd.get("rating") ?? "", body: String(fd.get("body") ?? "") });
    if (!check.success) {
      toast.error(check.error.issues[0]?.message ?? "Check your review");
      return;
    }
    run(() => postReview({ orderId, rating: check.data.rating, body: check.data.body }), "Thanks for your review");
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4 text-sm">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-medium">Your rating</legend>
        <div className="flex flex-wrap gap-4">
          {[1, 2, 3, 4, 5].map((n) => (
            <label key={n} className="flex items-center gap-1.5">
              <input type="radio" name="rating" value={n} className="size-4 accent-primary" />
              {`${n} ${n === 1 ? "star" : "stars"}`}
            </label>
          ))}
        </div>
      </fieldset>

      <Field label="Comments (optional)" name="body">
        <Textarea id="body" name="body" maxLength={2000} />
      </Field>

      <div>
        <Button type="submit" disabled={pending}>
          Submit review
        </Button>
      </div>
    </form>
  );
}
