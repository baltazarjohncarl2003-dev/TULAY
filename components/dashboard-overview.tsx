import Link from "next/link";
import { Notice } from "@/components/common";
import { buttonVariants } from "@/components/ui/button";
import { getSessionUser } from "@/lib/auth";
import { adminWorkQueue } from "@/lib/data/admin";
import { getDealCounts, type DealCounts } from "@/lib/data/deals";
import { listMyNotifications } from "@/lib/data/notifications";
import { getMyApplication } from "@/lib/data/supplier";
import type { Role } from "@/lib/types";
import { date, qty } from "@/lib/format";

const CTA: Record<Role, { href: string; label: string }> = {
  buyer: { href: "/buyer/rfqs/new", label: "+ New sourcing request" },
  supplier: { href: "/supplier/invites", label: "View opportunities" },
  admin: { href: "/admin/rfqs", label: "View review queue" },
};

const ACTIONS: Record<Role, { href: string; label: string }[]> = {
  buyer: [
    { href: "/buyer/rfqs/new", label: "Create sourcing request" },
    { href: "/buyer/rfqs", label: "Review my RFQs" },
    { href: "/marketplace", label: "Browse marketplace" },
  ],
  supplier: [
    { href: "/supplier/profile", label: "Manage company profile" },
    { href: "/supplier/invites", label: "View invitations" },
    { href: "/supplier/quotes", label: "Quotation history" },
  ],
  admin: [
    { href: "/admin/suppliers", label: "Review supplier accounts" },
    { href: "/admin/rfqs", label: "Review sourcing requests" },
    { href: "/admin/transactions", label: "Track transactions" },
  ],
};

// The counts are all-time and already split by the viewer's buying and selling side.
function metricsFor(role: "buyer" | "supplier", counts: DealCounts): { label: string; value: number }[] {
  if (role === "buyer") {
    return [
      { label: "Requests", value: counts.buyerRfqs },
      { label: "Quotations", value: counts.buyerQuotes },
      { label: "Selections", value: counts.buyerSelections },
    ];
  }
  return [
    { label: "Requests", value: counts.supplierInvites },
    { label: "Quotations", value: counts.supplierQuotes },
    { label: "Selections", value: counts.supplierSelections },
  ];
}

export async function DashboardOverview({ role }: { role: Role }) {
  const me = await getSessionUser();
  const isAdmin = role === "admin";
  // Admins get counts of waiting work; buyers and suppliers get their own deal counts.
  const [counts, queue] = isAdmin
    ? [null, me ? await adminWorkQueue(me) : []]
    : [await getDealCounts(), []];
  // The database calls the approved state "verified".
  const application = role === "supplier" ? await getMyApplication() : null;
  const firstName = me?.fullName.split(" ")[0] ?? "";
  const cta = CTA[role];
  const notifications = await listMyNotifications(5);

  return (
    <div className="flex flex-col gap-6">
      <section className="relative overflow-hidden rounded-xl bg-primary p-6 text-primary-foreground sm:p-8">
        <span className="text-xs font-semibold tracking-wide uppercase opacity-80">
          Your TULAY {role} space
        </span>
        <h1 className="mt-2 text-title tracking-tight">Good to see you, {firstName}.</h1>
        <p className="mt-2 max-w-xl text-sm opacity-90">Make your next business move, all from one place.</p>
        <div className="mt-5">
          <Link href={cta.href} className={buttonVariants({ variant: "secondary" })}>
            {cta.label}
          </Link>
        </div>
      </section>

      {role === "supplier" && application?.status !== "verified" && (
        <Notice tone="warn">
          Your company is not verified yet. <Link href="/supplier/profile" className="font-medium underline">Finish your company profile</Link> to receive invitations.
        </Notice>
      )}

      <div>
        <span className="text-xs font-semibold tracking-wide text-primary uppercase">Your business at a glance</span>
        <h2 className="text-xl font-bold tracking-tight">Workspace overview</h2>
      </div>

      {counts ? (
        <div className="grid gap-4 sm:grid-cols-3">
          {metricsFor(role as "buyer" | "supplier", counts).map((m) => (
            <div key={m.label} className="flex flex-col gap-1 rounded-xl bg-card p-5 ring-1 ring-foreground/10">
              <span className="text-sm text-muted-foreground">{m.label}</span>
              <span className="text-3xl font-bold tracking-tight">{qty(m.value)}</span>
              <span className="text-xs text-muted-foreground">Based on your account records</span>
            </div>
          ))}
        </div>
      ) : (
        <AdminWorkQueue items={queue} />
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="flex flex-col gap-3 rounded-xl bg-card p-5 ring-1 ring-foreground/10">
          <div>
            <span className="text-xs font-semibold tracking-wide text-primary uppercase">Keep moving</span>
            <h3 className="font-semibold">Quick actions</h3>
          </div>
          <div className="flex flex-col gap-2">
            {ACTIONS[role].map((a) => (
              <Link
                key={a.href}
                href={a.href}
                className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-sm font-medium hover:bg-muted"
              >
                <span>{a.label}</span>
                <span aria-hidden="true" className="text-muted-foreground">↗</span>
              </Link>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-3 rounded-xl bg-card p-5 ring-1 ring-foreground/10">
          <div>
            <span className="text-xs font-semibold tracking-wide text-primary uppercase">Stay in the loop</span>
            <h3 className="font-semibold">Recent updates</h3>
          </div>
          {notifications.length > 0 ? (
            <div className="flex flex-col divide-y">
              {notifications.map((n) => (
                <div key={n.id} className="flex flex-col gap-0.5 py-3 first:pt-0 last:pb-0">
                  {n.link ? (
                    <Link href={n.link} className="text-sm font-medium hover:underline">
                      {n.title}
                    </Link>
                  ) : (
                    <span className="text-sm font-medium">{n.title}</span>
                  )}
                  <span className="text-sm text-muted-foreground">{n.body}</span>
                  <span className="text-xs text-muted-foreground">{date(n.createdAt)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-1 py-6 text-center">
              <h4 className="font-semibold">All caught up.</h4>
              <p className="text-sm text-muted-foreground">Notifications about your sourcing activity will appear here.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function AdminWorkQueue({ items }: { items: Awaited<ReturnType<typeof adminWorkQueue>> }) {
  // Items for roles this admin does not hold are 0 and are hidden; only waiting work is listed.
  const waiting = items.filter((i) => i.count > 0);
  if (waiting.length === 0) {
    return (
      <div className="flex flex-col gap-1 rounded-xl bg-card p-5 text-center ring-1 ring-foreground/10">
        <h3 className="font-semibold">Nothing is waiting for you.</h3>
        <p className="text-sm text-muted-foreground">Work that needs your roles will be listed here.</p>
      </div>
    );
  }
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {waiting.map((i) => (
        <li key={i.key}>
          <Link href={i.href} className="flex h-full flex-col gap-1 rounded-xl bg-card p-5 ring-1 ring-foreground/10 hover:bg-muted">
            <span className="text-3xl font-bold tracking-tight">{qty(i.count)}</span>
            <span className="text-sm text-muted-foreground">{i.count === 1 ? i.singular : i.plural}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
