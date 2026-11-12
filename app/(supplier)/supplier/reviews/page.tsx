import { EmptyState, Notice, PageHeader } from "@/components/common";
import { listReviews } from "@/lib/data/claims";
import { date } from "@/lib/format";
import { ReviewReply } from "./review-reply";

export const metadata = { title: "Reviews" };

function stars(rating: number) {
  const n = Math.max(0, Math.min(5, Math.round(rating)));
  return "★".repeat(n) + "☆".repeat(5 - n);
}

export default async function SupplierReviewsPage() {
  const reviews = await listReviews("supplier");
  const visible = reviews.filter((r) => !r.hidden);
  const sum = visible.reduce((total, r) => total + r.rating, 0);
  // Display rounding only, not money.
  const average = visible.length ? (Math.round((sum * 10) / visible.length) / 10).toFixed(1) : null;

  return (
    <>
      <PageHeader
        eyebrow="Supplier"
        title="Reviews"
        description="Buyer reviews of your business. You can reply once to each review."
      />

      <section className="mb-8 flex flex-col gap-1 rounded-lg border bg-card p-4">
        <h2 className="text-sm text-muted-foreground">Average rating</h2>
        {average ? (
          <p className="text-2xl font-semibold">
            <span className="text-amber-500">{stars(Number(average))}</span> {average} ({visible.length}{" "}
            {visible.length === 1 ? "review" : "reviews"})
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">No visible reviews yet.</p>
        )}
      </section>

      {reviews.length ? (
        <ul className="flex flex-col gap-3">
          {reviews.map((r) => (
            <li key={r.id} className="flex flex-col gap-3 rounded-lg border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="text-amber-500">{stars(r.rating)}</span>
                <span className="text-muted-foreground">{date(r.createdAt)}</span>
              </div>
              {r.hidden && <Notice tone="warn">Hidden by TULAY: {r.hiddenReason}</Notice>}
              <p className="text-sm whitespace-pre-line">{r.body}</p>
              {r.repliedAt ? (
                <div className="rounded-md bg-muted/50 p-3 text-sm">
                  <p className="text-xs text-muted-foreground">Your reply · {date(r.repliedAt)}</p>
                  <p className="whitespace-pre-line">{r.supplierReply}</p>
                </div>
              ) : (
                <ReviewReply reviewId={r.id} />
              )}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="No reviews yet." />
      )}
    </>
  );
}
