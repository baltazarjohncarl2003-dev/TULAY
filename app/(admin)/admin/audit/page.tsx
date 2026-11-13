import { EmptyState, PageHeader } from "@/components/common";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listAuditLog } from "@/lib/data/admin";
import { dateTime } from "@/lib/format";

export const metadata = { title: "Audit log" };

export default async function Page() {
  const rows = await listAuditLog();
  return (
    <>
      <PageHeader
        eyebrow="Trust operations"
        title="Audit log"
        description="Who changed what, newest first (latest 100)."
      />

      {rows.length === 0 ? (
        <EmptyState title="No entries to show.">Only super admins can read the audit log.</EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{dateTime(r.createdAt)}</TableCell>
                  <TableCell>
                    <code>{r.action}</code>
                  </TableCell>
                  <TableCell>{`${r.targetTable} · ${r.targetId.slice(0, 8)}`}</TableCell>
                  <TableCell>{r.actorId ? r.actorId.slice(0, 8) : "system"}</TableCell>
                  <TableCell>
                    <code className="text-xs break-all">{JSON.stringify(r.details)}</code>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
