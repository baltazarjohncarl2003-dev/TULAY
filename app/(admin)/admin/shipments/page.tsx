import Link from "next/link";
import { EmptyState, Notice, PageHeader, StatusPill } from "@/components/common";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listShipments } from "@/lib/data/orders";
import { date, php } from "@/lib/format";

export const metadata = { title: "Shipments" };

const isProblem = (status: string) => status === "returned" || status === "failed_attempt";

export default async function AdminShipmentsPage() {
  const shipments = await listShipments();
  const attention = shipments.filter((s) => isProblem(s.status)).length;

  return (
    <>
      <PageHeader
        eyebrow="Delivery"
        title="Shipments"
        description="Every courier shipment. Returned and failed attempts are listed first."
      />

      {attention > 0 && <Notice tone="warn">{attention} shipments need attention.</Notice>}

      {shipments.length === 0 ? (
        <EmptyState title="No shipments yet." />
      ) : (
        <div className="mt-4 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Carrier</TableHead>
                <TableHead>Tracking ref</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>COD</TableHead>
                <TableHead>Last update</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shipments.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    <Link href="/admin/orders" className="font-medium text-primary hover:underline">
                      {s.orders?.ref ?? "—"}
                    </Link>
                  </TableCell>
                  <TableCell>{s.orders?.suppliers?.business_name ?? "—"}</TableCell>
                  <TableCell>{s.carrier}</TableCell>
                  <TableCell>{s.tracking_ref}</TableCell>
                  <TableCell>
                    <StatusPill
                      status={s.status}
                      className={isProblem(s.status) ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300" : undefined}
                    />
                  </TableCell>
                  <TableCell>{s.cod_amount_centavos > 0 ? php(s.cod_amount_centavos) : "—"}</TableCell>
                  <TableCell>{date(s.updated_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
