import { cn } from "@/lib/utils";
import { label } from "@/lib/format";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex flex-col gap-1">
        {eyebrow && <span className="text-xs font-semibold tracking-wide text-primary uppercase">{eyebrow}</span>}
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        {description && <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

const TONE: Record<string, string> = {
  good: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  warn: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  bad: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  info: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  neutral: "bg-muted text-muted-foreground",
};
const STATUS_TONE: Record<string, keyof typeof TONE> = {
  approved: "good", active: "good", accepted: "good", supplier_selected: "good", recorded: "good",
  pending: "warn", under_review: "warn", needs_information: "warn", invited: "info", matching: "info", quoting: "info", paused: "neutral",
  rejected: "bad", declined: "bad", cancelled: "bad", suspended: "bad",
  draft: "neutral",
};

/** Status badge for any snake_case status value. */
export function StatusPill({ status, className }: { status: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize",
        TONE[STATUS_TONE[status] ?? "neutral"],
        className,
      )}
    >
      {label(status)}
    </span>
  );
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-10 text-center">
      <h3 className="font-semibold">{title}</h3>
      {children && <div className="flex flex-col items-center gap-3 text-sm text-muted-foreground">{children}</div>}
    </div>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn"; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "rounded-md border px-3 py-2 text-sm",
        tone === "warn" ? "border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200" : "bg-muted/50",
      )}
    >
      {children}
    </div>
  );
}

/** Label/value row used in detail panels. */
export function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1 text-sm">
      <span className="text-muted-foreground">{k}</span>
      <strong className="text-right font-medium">{v ?? "—"}</strong>
    </div>
  );
}
