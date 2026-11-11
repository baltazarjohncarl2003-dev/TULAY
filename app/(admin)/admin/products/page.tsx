import Image from "next/image";
import { EmptyState, PageHeader } from "@/components/common";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listProductsForReview } from "@/lib/data/catalog";
import { date, label, php, qty } from "@/lib/format";
import { ReviewButtons } from "./review-buttons";

export const metadata = { title: "Product review" };

export default async function AdminProductsPage() {
  const queue = await listProductsForReview();
  return (
    <>
      <PageHeader
        eyebrow="Marketplace moderation"
        title="Review product listings"
        description="Only approved products from approved suppliers appear publicly."
      />

      {queue.length === 0 ? (
        <EmptyState title="Nothing waiting for review." />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>MOQ</TableHead>
                <TableHead>Indicative price</TableHead>
                <TableHead>Price tiers</TableHead>
                <TableHead>Return class</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {queue.map(({ product: p, supplier, submittedAt }) => {
                const image = p.imageUrls?.[0];
                const tiers = p.priceTiers?.length ?? 0;
                return (
                  <TableRow key={p.id}>
                    <TableCell>
                      <div className="flex max-w-xs items-start gap-3">
                        {image && (
                          <div className="relative size-14 shrink-0 overflow-hidden rounded-md border">
                            <Image src={image} alt="" fill unoptimized sizes="3.5rem" className="object-cover" />
                          </div>
                        )}
                        <div className="flex flex-col gap-1">
                          <strong className="font-medium">{p.title}</strong>
                          <span className="text-xs text-muted-foreground">{p.description.slice(0, 110)}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{supplier.businessName}</TableCell>
                    <TableCell>
                      {qty(p.moq)} {p.unit}
                    </TableCell>
                    <TableCell>{p.indicativePriceCentavos === null ? "Quote only" : php(p.indicativePriceCentavos)}</TableCell>
                    <TableCell>{tiers ? `${tiers} tier${tiers === 1 ? "" : "s"}` : "None"}</TableCell>
                    <TableCell>{label(p.returnClass)}</TableCell>
                    <TableCell>{date(submittedAt)}</TableCell>
                    <TableCell>
                      <ReviewButtons productId={p.id} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
