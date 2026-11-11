import Link from "next/link";
import { BadgeCheckIcon, MapPinIcon } from "lucide-react";
import { CategoryIcon } from "@/components/category-icon";
import { SaveButton } from "@/components/save-button";
import { buttonVariants } from "@/components/ui/button";
import { categoryName } from "@/lib/demo/data";
import type { BusinessType, Supplier } from "@/lib/demo/types";
import { cn } from "@/lib/utils";

export const BUSINESS_TYPE_LABEL: Record<BusinessType, string> = {
  manufacturer: "Manufacturer",
  supplier: "Supplier",
  wholesaler: "Wholesaler",
  distributor: "Distributor",
  service_provider: "Service provider",
};

/** Only shown for status "approved": it reflects TULAY's admin review, nothing more. */
export function ApprovedBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn("inline-flex w-fit items-center gap-1 text-xs font-medium text-success", className)}
      title="Business documents reviewed by TULAY. Not a quality guarantee."
    >
      <BadgeCheckIcon aria-hidden="true" className="size-3.5" />
      Approved supplier
    </span>
  );
}

/** Business card for directory, search and home. `mainProducts` = a few listing titles. */
export function SupplierCard({ supplier, mainProducts = [] }: { supplier: Supplier; mainProducts?: string[] }) {
  const s = supplier;
  return (
    <article className="flex flex-col gap-3 rounded-lg border bg-card p-4 text-sm">
      <div className="flex items-start gap-3">
        <div
          aria-hidden="true"
          className="flex size-11 shrink-0 items-center justify-center rounded-md bg-accent text-primary"
        >
          <CategoryIcon slug={s.categorySlug} />
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 className="truncate font-semibold">
            <Link href={`/suppliers/${s.id}`} className="hover:underline">
              {s.businessName}
            </Link>
          </h3>
          <span className="text-xs text-muted-foreground">
            {BUSINESS_TYPE_LABEL[s.businessType]} · {categoryName(s.categorySlug)}
          </span>
          {s.status === "approved" && <ApprovedBadge />}
        </div>
        <SaveButton kind="supplier" id={s.id} label={s.businessName} className="ml-auto" />
      </div>
      <p className="line-clamp-2 text-muted-foreground">{s.description}</p>
      <dl className="grid gap-1 text-xs">
        <div className="flex items-center gap-1 text-muted-foreground">
          <MapPinIcon aria-hidden="true" className="size-3.5" />
          <dt className="sr-only">Location</dt>
          <dd>
            {s.city}, {s.province}
          </dd>
        </div>
        {s.yearsOperating !== null && (
          <div className="flex gap-1 text-muted-foreground">
            <dt className="sr-only">Years operating</dt>
            <dd>
              {s.yearsOperating} yrs in business <span className="italic">(self-reported)</span>
            </dd>
          </div>
        )}
        {mainProducts.length > 0 && (
          <div className="flex gap-1">
            <dt className="text-muted-foreground">Main:</dt>
            <dd className="truncate">{mainProducts.join(", ")}</dd>
          </div>
        )}
      </dl>
      <div className="mt-auto flex gap-2">
        <Link href={`/suppliers/${s.id}`} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "flex-1")}>
          View profile
        </Link>
        <Link href="/buyer/rfqs/new" className={cn(buttonVariants({ size: "sm" }), "flex-1")}>
          Request quote
        </Link>
      </div>
    </article>
  );
}
