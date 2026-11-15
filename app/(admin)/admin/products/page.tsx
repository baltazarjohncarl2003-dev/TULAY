import Image from "next/image";
import { EmptyState, PageHeader, StatusPill } from "@/components/common";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { canAdmin, requireRole } from "@/lib/auth";
import { PRODUCT_TABS, listAdminProducts } from "@/lib/data/admin";
import { parseListParams } from "@/lib/data/admin-money";
import { date, label, php, qty } from "@/lib/format";
import { NeedsRole, Pager } from "../orders/list-controls";
import { StatusTabs } from "../suppliers/status-tabs";
import { ReviewButtons } from "./review-buttons";

export const metadata = { title: "Product review" };

const TABS = [
  { value: "", label: "Pending review" },
  { value: "approved", label: "Live" },
  { value: "rejected", label: "Rejected" },
  { value: "all", label: "All" },
];

export default async function AdminProductsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireRole("admin");
  const params = parseListParams(await searchParams, PRODUCT_TABS);
  const result = await listAdminProducts(params);
  const canReview = canAdmin(user, "verifier");
  return (
    <>
      <PageHeader
        eyebrow="Marketplace moderation"
        title="Review product listings"
        description="Only approved products from approved suppliers appear publicly. A live listing can be taken down with a reason."
      />

      {!canReview && <NeedsRole role="verifier" />}
      <StatusTabs tabs={TABS} status={params.status} q={params.q} placeholder="Product title" />

      {result.rows.length === 0 ? (
        <EmptyState title={params.q || params.status ? "No listings match." : "Nothing waiting for review."} />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>MOQ</TableHead>
                <TableHead>Indicative price</TableHead>
                <TableHead>Return class</TableHead>
                <TableHead>Submitted</TableHead>
                {canReview && <TableHead>Action</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.rows.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <div className="flex max-w-sm flex-col gap-2">
                      <strong className="font-medium">{p.title}</strong>
                      <details className="text-sm">
                        <summary className="cursor-pointer text-primary">Full preview</summary>
                        <div className="mt-2 flex flex-col gap-3">
                          {p.images.length === 0 ? (
                            <p className="text-xs text-muted-foreground">No images uploaded.</p>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {p.images.map((src) => (
                                <div key={src} className="relative size-20 overflow-hidden rounded-md border">
                                  <Image src={src} alt={`${p.title} image`} fill unoptimized sizes="5rem" className="object-cover" />
                                </div>
                              ))}
                            </div>
                          )}
                          <p className="whitespace-pre-wrap">{p.description}</p>
                          <div>
                            <h3 className="text-xs font-semibold uppercase text-muted-foreground">Price tiers</h3>
                            {p.tiers.length === 0 ? (
                              <p className="text-xs text-muted-foreground">None</p>
                            ) : (
                              <ul className="text-xs">
                                {p.tiers.map((t) => (
                                  <li key={t.minQty}>
                                    {qty(t.minQty)}+ {p.unit}: {php(t.unitPriceCentavos)} each
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                          <div>
                            <h3 className="text-xs font-semibold uppercase text-muted-foreground">Options</h3>
                            {p.variants.length === 0 ? (
                              <p className="text-xs text-muted-foreground">None</p>
                            ) : (
                              <ul className="text-xs">
                                {p.variants.map((v) => (
                                  <li key={v.name}>
                                    {v.name}
                                    {v.priceDeltaCentavos !== 0 && ` (${v.priceDeltaCentavos > 0 ? "+" : "-"}${php(Math.abs(v.priceDeltaCentavos))})`}
                                    {v.stock !== null && ` · stock ${qty(v.stock)}`}
                                    {!v.active && " · hidden"}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                          {p.reviewNote && <p className="text-xs text-muted-foreground">Review note: {p.reviewNote}</p>}
                        </div>
                      </details>
                    </div>
                  </TableCell>
                  <TableCell>{p.supplierName}</TableCell>
                  <TableCell>
                    <StatusPill status={p.status} />
                  </TableCell>
                  <TableCell>
                    {qty(p.moq)} {p.unit}
                  </TableCell>
                  <TableCell>{p.priceCentavos === null ? "Quote only" : php(p.priceCentavos)}</TableCell>
                  <TableCell>{label(p.returnClass)}</TableCell>
                  <TableCell>{date(p.submittedAt)}</TableCell>
                  {canReview && (
                    <TableCell>
                      {(p.status === "pending" || p.status === "approved") && <ReviewButtons productId={p.id} status={p.status} />}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <Pager data={result} params={params} />
    </>
  );
}
