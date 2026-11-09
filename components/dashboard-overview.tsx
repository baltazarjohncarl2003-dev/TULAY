import Link from "next/link";
import { Notice } from "@/components/common";
import { buttonVariants } from "@/components/ui/button";
import { DEMO_SUPPLIER, DEMO_USERS, NOTIFICATIONS, INVITES, QUOTES, RFQS, SELECTIONS, rfqById } from "@/lib/demo/data";
import type { Role } from "@/lib/demo/types";
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

// Demo identities: buyers and admins own rows by user id, the supplier account owns company s1.
const SUPPLIER_ID = DEMO_SUPPLIER.id;

function metricsFor(role: Role): { label: string; value: number }[] {
  if (role === "buyer") {
    const buyerId = DEMO_USERS.buyer.id;
    return [
      { label: "Requests", value: RFQS.filter((r) => r.buyerId === buyerId).length },
      { label: "Quotations", value: QUOTES.filter((q) => rfqById(q.rfqId)?.buyerId === buyerId).length },
      { label: "Selections", value: SELECTIONS.filter((s) => s.buyerId === buyerId).length },
    ];
  }
  if (role === "supplier") {
    return [
      { label: "Requests", value: INVITES.filter((i) => i.supplierId === SUPPLIER_ID).length },
      { label: "Quotations", value: QUOTES.filter((q) => q.supplierId === SUPPLIER_ID).length },
      { label: "Selections", value: SELECTIONS.filter((s) => s.supplierId === SUPPLIER_ID).length },
    ];
  }
  return [
    { label: "Requests", value: RFQS.filter((r) => r.status !== "draft").length },
    { label: "Quotations", value: QUOTES.length },
    { label: "Selections", value: SELECTIONS.length },
  ];
}

export function DashboardOverview({ role }: { role: Role }) {
  const user = DEMO_USERS[role];
  const firstName = user.name.split(" ")[0];
  const cta = CTA[role];
  const notifications = NOTIFICATIONS.filter((n) => n.userId === user.id).slice(0, 5);

  return (
    <div className="flex flex-col gap-6">
      <section className="relative overflow-hidden rounded-xl bg-primary p-6 text-primary-foreground sm:p-8">
        <span className="text-xs font-semibold tracking-wide uppercase opacity-80">
          Your TULAY {role} space
        </span>
        <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Good to see you, {firstName}.</h1>
        <p className="mt-2 max-w-xl text-sm opacity-90">Make your next business move, all from one place.</p>
        <div className="mt-5">
          <Link href={cta.href} className={buttonVariants({ variant: "secondary" })}>
            {cta.label}
          </Link>
        </div>
      </section>

      {role === "supplier" && DEMO_SUPPLIER.status !== "approved" && (
        <Notice tone="warn">
          Your company is not verified yet. <Link href="/supplier/profile" className="font-medium underline">Finish your company profile</Link> to receive invitations.
        </Notice>
      )}

      <div>
        <span className="text-xs font-semibold tracking-wide text-primary uppercase">Your business at a glance</span>
        <h2 className="text-xl font-bold tracking-tight">Workspace overview</h2>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {metricsFor(role).map((m) => (
          <div key={m.label} className="flex flex-col gap-1 rounded-xl bg-card p-5 ring-1 ring-foreground/10">
            <span className="text-sm text-muted-foreground">{m.label}</span>
            <span className="text-3xl font-bold tracking-tight">{qty(m.value)}</span>
            <span className="text-xs text-muted-foreground">Based on your account records</span>
          </div>
        ))}
      </div>

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
                  <span className="text-sm font-medium">{n.title}</span>
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
