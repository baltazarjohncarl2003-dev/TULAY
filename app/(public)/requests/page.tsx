import Link from "next/link";
import { RespondButton } from "./respond-button";
import { EmptyState, PageHeader } from "@/components/common";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getSessionUser } from "@/lib/auth";
import { BOARD_PAGE_SIZE, hasSupplierAccount, listBoardRequests } from "@/lib/data/board";
import { date, qty } from "@/lib/format";

export const metadata = { title: "Buyer Requests" };

export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const raw = (await searchParams).page;
  const n = Number(Array.isArray(raw) ? raw[0] : raw);
  const page = Number.isSafeInteger(n) && n > 1 ? n : 1;

  const [user, { requests, total }] = await Promise.all([getSessionUser(), listBoardRequests(page)]);
  const isSupplier = user ? await hasSupplierAccount() : false;
  const totalPages = Math.ceil(total / BOARD_PAGE_SIZE);

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6">
      <PageHeader
        eyebrow="Buyer requests"
        title="What buyers need"
        description="Open requests from businesses across the Philippines. Verified suppliers can ask to quote; buyer names and budgets stay private."
        actions={
          <Link href="/buyer/rfqs/new" className={buttonVariants({ size: "sm" })}>
            Post a request
          </Link>
        }
      />

      {requests.length === 0 ? (
        <EmptyState title="No open requests right now.">
          <div className="flex flex-wrap justify-center gap-2">
            <Link href="/buyer/rfqs/new" className={buttonVariants({ size: "sm" })}>
              Post a request
            </Link>
            <Link href="/marketplace" className={buttonVariants({ variant: "outline", size: "sm" })}>
              Browse products
            </Link>
          </div>
        </EmptyState>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {requests.map((r) => (
            <li key={r.id}>
              <Card className="h-full">
                <div className="flex flex-wrap items-center gap-2">
                  {r.categoryName && <Badge variant="secondary">{r.categoryName}</Badge>}
                </div>
                <h2 className="font-semibold">{r.product}</h2>
                <div className="flex flex-col gap-0.5 text-sm">
                  {r.quantity !== null && (
                    <span>
                      {qty(r.quantity)} {r.unit}
                    </span>
                  )}
                  <span>{r.province}</span>
                  {r.requiredBy && <span>Needed by {date(r.requiredBy)}</span>}
                </div>
                <p className="line-clamp-3 text-sm text-muted-foreground">{r.description}</p>
                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>Posted {date(r.createdAt)}</span>
                  <span>{r.ref}</span>
                </div>
                <div className="mt-auto">
                  <RespondButton rfqId={r.id} responded={r.alreadyResponded} isSupplier={isSupplier} />
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {total > BOARD_PAGE_SIZE && (
        <nav aria-label="Pages" className="mt-6 flex items-center justify-between">
          {page > 1 ? (
            <Link href={`/requests?page=${page - 1}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
              Previous
            </Link>
          ) : (
            <span />
          )}
          {page < totalPages ? (
            <Link href={`/requests?page=${page + 1}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
              Next
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </main>
  );
}
