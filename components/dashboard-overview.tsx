import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { getSessionUser } from "@/lib/auth";
import { loadDeals, type DealBundle } from "@/lib/data/deals";
import { getMyApplication } from "@/lib/data/supplier";
import type { Role } from "@/lib/types";
import { date, qty } from "@/lib/format";

const CTA = { href: "/admin/rfqs", label: "View review queue" };

const ACTIONS = [
  { href: "/admin/suppliers", label: "Review supplier accounts" },
  { href: "/admin/rfqs", label: "Review sourcing requests" },
  { href: "/admin/transactions", label: "Track transactions" },
];

// deals is RLS-scoped to the viewer, so each role's counts come from its own rows.
function metricsFor(role: Role, deals: DealBundle): { label: string; value: number }[] {
  const { userId, supplierId } = deals.viewer;
  if (role === "buyer") {
    return [
      { label: "Requests", value: deals.rfqs.filter((r) => r.buyerId === userId).length },
      {
        label: "Quotations",
        value: deals.quotes.filter((q) => deals.rfqs.find((r) => r.id === q.rfqId)?.buyerId === userId).length,
      },
      { label: "Selections", value: deals.selections.filter((s) => s.buyerId === userId).length },
    ];
  }
  if (role === "supplier") {
    return [
      { label: "Requests", value: deals.invites.filter((i) => i.supplierId === supplierId).length },
      { label: "Quotations", value: deals.quotes.filter((q) => q.supplierId === supplierId).length },
      { label: "Selections", value: deals.selections.filter((s) => s.supplierId === supplierId).length },
    ];
  }
  return [
    { label: "Requests", value: deals.rfqs.filter((r) => r.status !== "draft").length },
    { label: "Quotations", value: deals.quotes.length },
    { label: "Selections", value: deals.selections.length },
  ];
}

export async function DashboardOverview({ role }: { role: Role }) {
  const me = await getSessionUser();
  const deals = await loadDeals();
  // The database calls the approved state "verified".
  const application = role === "supplier" ? await getMyApplication() : null;
  const firstName = me?.fullName.split(" ")[0] ?? "";
  const cta = CTA[role];
  const notifications = deals.notifications.slice(0, 5);

  return (
    <div className="flex flex-col gap-6">
      <section className="relative overflow-hidden rounded-xl bg-primary p-6 text-primary-foreground sm:p-8">
        <span className="text-xs font-semibold tracking-wide uppercase opacity-80">
          Your TULAY admin space
        </span>
        <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Good to see you, {firstName}.</h1>
        <p className="mt-2 max-w-xl text-sm opacity-90">Make your next business move, all from one place.</p>
        <div className="mt-5">
          <Link href={CTA.href} className={buttonVariants({ variant: "secondary" })}>
            {CTA.label}
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

      <div className="grid gap-4 sm:grid-cols-3">
        {metricsFor(role, deals).map((m) => (
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
            {ACTIONS.map((a) => (
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
