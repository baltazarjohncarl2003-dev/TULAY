import Link from "next/link";
import { Notice } from "@/components/common";
import { NativeSelect } from "@/components/form";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { label } from "@/lib/format";
import type { ListParams, Paged } from "@/lib/data/admin-money";

/** Search box and status filter as a plain GET form (works without JavaScript); resets to page 1. */
export function ListFilters({
  params,
  statuses,
  placeholder,
  extra,
}: {
  params: ListParams;
  statuses: readonly string[];
  placeholder: string;
  /** Other query params to keep when filtering. */
  extra?: Record<string, string>;
}) {
  return (
    <form method="get" role="search" className="mb-4 flex flex-col gap-2 sm:flex-row">
      {Object.entries(extra ?? {}).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <Input name="q" defaultValue={params.q} placeholder={placeholder} aria-label={placeholder} maxLength={80} className="sm:max-w-sm" />
      <NativeSelect name="status" defaultValue={params.status} aria-label="Filter by status" className="sm:w-48">
        <option value="">All statuses</option>
        {statuses.map((s) => (
          <option key={s} value={s}>
            {label(s)}
          </option>
        ))}
      </NativeSelect>
      <Button type="submit" variant="outline">
        Search
      </Button>
      {(params.q || params.status) && (
        <Link href="?" className={buttonVariants({ variant: "ghost" })}>
          Clear
        </Link>
      )}
    </form>
  );
}

/** Total count and previous / next links that keep the current search and filter. */
export function Pager({
  data,
  params,
  pageKey = "page",
  extra,
}: {
  data: Paged<unknown>;
  params: ListParams;
  pageKey?: string;
  /** Other query params to keep on every link. */
  extra?: Record<string, string>;
}) {
  const href = (page: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(extra ?? {})) sp.set(k, v);
    if (params.q) sp.set("q", params.q);
    if (params.status) sp.set("status", params.status);
    if (page > 1) sp.set(pageKey, String(page));
    return `?${sp.toString()}`;
  };
  return (
    <nav aria-label="Pages" className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm">
      <span className="text-muted-foreground">
        {data.total.toLocaleString("en-PH")} {data.total === 1 ? "result" : "results"} · page {data.page} of {data.pages}
      </span>
      <span className="flex gap-2">
        {data.page > 1 && (
          <Link href={href(data.page - 1)} className={buttonVariants({ variant: "outline", size: "sm" })}>
            Previous
          </Link>
        )}
        {data.page < data.pages && (
          <Link href={href(data.page + 1)} className={buttonVariants({ variant: "outline", size: "sm" })}>
            Next
          </Link>
        )}
      </span>
    </nav>
  );
}

/** Shown instead of a misleading empty list when RLS hides the rows from this admin. */
export function NeedsRole({ role }: { role: string }) {
  return <Notice tone="warn">Needs the {role} role. Ask a super admin to grant it.</Notice>;
}
