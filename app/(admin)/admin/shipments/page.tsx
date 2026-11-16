import Link from "next/link";
import { EmptyState, Notice, PageHeader, StatusPill } from "@/components/common";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { canAdmin, requireRole } from "@/lib/auth";
import { SHIPMENT_FILTERS, listAdminShipments, openProblemShipments, parseListParams, type AdminShipmentRow } from "@/lib/data/admin-money";
import { getNumberSettings } from "@/lib/data/settings";
import { date, php } from "@/lib/format";
import { carrierLabel } from "@/lib/shipping/couriers";
import { ListFilters, NeedsRole, Pager } from "../orders/list-controls";

export const metadata = { title: "Shipments" };

const isProblem = (status: string) => status === "returned" || status === "failed_attempt";

function ShipmentsTable({ rows }: { rows: AdminShipmentRow[] }) {
  return (
    <div className="overflow-x-auto">
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
          {rows.map((s) => (
            <TableRow key={s.id}>
              <TableCell>
                {s.order ? (
                  <Link href={`/admin/orders/${s.order.id}`} className="font-medium text-primary hover:underline">
                    {s.order.ref}
                  </Link>
                ) : (
                  "—"
                )}
              </TableCell>
              <TableCell>{s.supplierName ?? "—"}</TableCell>
              <TableCell>
                {carrierLabel(s.carrier, s.carrierName)}
                {s.manual && <span className="ml-2 text-xs text-muted-foreground">manual</span>}
              </TableCell>
              <TableCell>{s.trackingRef}</TableCell>
              <TableCell>
                <StatusPill
                  status={s.status}
                  className={isProblem(s.status) ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300" : undefined}
                />
              </TableCell>
              <TableCell>{s.codCentavos > 0 ? php(s.codCentavos) : "—"}</TableCell>
              <TableCell>{date(s.updatedAt)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export default async function AdminShipmentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireRole("admin");
  const { shipment_stale_days: staleDays } = await getNumberSettings(["shipment_stale_days"]);
  const header = (
    <PageHeader
      eyebrow="Delivery"
      title="Shipments"
      description={`Every courier shipment. Returned and failed attempts on orders that are still open are listed first. "Stale" lists open shipments with no update in ${staleDays} days.`}
    />
  );
  if (!canAdmin(user, "finance", "support")) {
    return (
      <>
        {header}
        <NeedsRole role="finance or support" />
      </>
    );
  }

  const params = parseListParams(await searchParams, SHIPMENT_FILTERS);
  const filtered = Boolean(params.q || params.status);
  const [shipments, problems] = await Promise.all([listAdminShipments(params, staleDays), openProblemShipments()]);

  return (
    <>
      {header}

      {problems.length > 0 && (
        <section className="mb-6 flex flex-col gap-3">
          <Notice tone="warn">
            {problems.length} {problems.length === 1 ? "shipment needs" : "shipments need"} attention (returned or failed, order still open).
          </Notice>
          {!filtered && <ShipmentsTable rows={problems} />}
        </section>
      )}

      <ListFilters params={params} statuses={SHIPMENT_FILTERS} placeholder="Order ref or tracking ref" />

      {shipments.rows.length === 0 ? (
        <EmptyState title={filtered ? "No shipments match." : "No shipments yet."} />
      ) : (
        <ShipmentsTable rows={shipments.rows} />
      )}
      <Pager data={shipments} params={params} />
    </>
  );
}
