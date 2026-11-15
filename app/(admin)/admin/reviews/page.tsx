import Link from "next/link";
import { EmptyState, Notice, PageHeader } from "@/components/common";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { canAdmin, requireRole } from "@/lib/auth";
import { listAdminReviews } from "@/lib/data/admin-money";
import { date } from "@/lib/format";
import { NeedsRole } from "../orders/list-controls";
import { HideReview } from "./hide-review";

export const metadata = { title: "Reviews" };

export default async function AdminReviewsPage() {
  const user = await requireRole("admin");
  const header = (
    <PageHeader
      eyebrow="Trust operations"
      title="Reviews"
      description="Hide abusive reviews. Hidden reviews are removed from supplier storefronts and product pages."
    />
  );
  if (!canAdmin(user, "support")) {
    return (
      <>
        {header}
        <NeedsRole role="support" />
      </>
    );
  }

  const reviews = await listAdminReviews();
  return (
    <>
      {header}

      {reviews.length === 0 ? (
        <EmptyState title="No reviews yet." />
      ) : (
        <div className="flex flex-col gap-4">
          {reviews.map((r) => (
            <Card key={r.id}>
              <CardHeader>
                <CardTitle>
                  <span role="img" aria-label={`${r.rating} out of 5 stars`}>
                    {"★".repeat(r.rating)}
                  </span>{" "}
                  <span className="text-muted-foreground">({r.rating}/5)</span>
                </CardTitle>
                <CardDescription>
                  {r.supplierName} · by {r.buyerName} ·{" "}
                  {r.order ? (
                    <Link href={`/admin/orders/${r.order.id}`} className="text-primary hover:underline">
                      Order {r.order.ref}
                    </Link>
                  ) : (
                    "order unknown"
                  )}{" "}
                  · submitted {date(r.createdAt)}
                </CardDescription>
                <CardAction>
                  <HideReview reviewId={r.id} hidden={r.hidden} />
                </CardAction>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 text-sm">
                <p>{r.body}</p>
                {r.supplierReply && <p className="text-muted-foreground">Supplier reply: {r.supplierReply}</p>}
                {r.hidden && <Notice tone="warn">Hidden: {r.hiddenReason || "no reason recorded"}</Notice>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
