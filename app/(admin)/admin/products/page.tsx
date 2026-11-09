import { EmptyState, PageHeader, StatusPill } from "@/components/common";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PRODUCTS, supplierById } from "@/lib/demo/data";
import { label, php, qty } from "@/lib/format";
import { ReviewButtons } from "./review-buttons";

export const metadata = { title: "Product review" };

// Pending first, then newest first.
const products = [...PRODUCTS].sort(
  (a, b) =>
    Number(b.status === "pending") - Number(a.status === "pending") || b.createdAt.localeCompare(a.createdAt),
);

export default function AdminProductsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Marketplace moderation"
        title="Review product listings"
        description="Only approved products from approved suppliers appear publicly."
      />

      {products.length === 0 ? (
        <EmptyState title="No products submitted yet.">
          <p>Approved suppliers can add listings under My products.</p>
        </EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>MOQ</TableHead>
                <TableHead>Indicative price</TableHead>
                <TableHead>Return class</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <div className="flex max-w-xs flex-col gap-1">
                      <strong className="font-medium">{p.title}</strong>
                      <span className="text-xs text-muted-foreground">{p.description.slice(0, 110)}</span>
                    </div>
                  </TableCell>
                  <TableCell>{supplierById(p.supplierId)?.businessName ?? "Unknown"}</TableCell>
                  <TableCell>
                    {qty(p.moq)} {p.unit}
                  </TableCell>
                  <TableCell>{p.indicativePriceCentavos === null ? "Quote only" : php(p.indicativePriceCentavos)}</TableCell>
                  <TableCell>{label(p.returnClass)}</TableCell>
                  <TableCell>
                    <StatusPill status={p.status} />
                  </TableCell>
                  <TableCell>{p.status === "pending" ? <ReviewButtons /> : "Reviewed"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
