import Link from "next/link";
import { BadgeCheckIcon, MapPinIcon } from "lucide-react";
import { CategoryIcon } from "@/components/category-icon";
import { MessageSupplierButton } from "@/components/message-supplier-button";
import { SaveButton } from "@/components/save-button";
import { buttonVariants } from "@/components/ui/button";
import { categoryName } from "@/lib/categories";
import type { BusinessType, Supplier } from "@/lib/types";
import { cn } from "@/lib/utils";

export const BUSINESS_TYPE_LABEL: Record<BusinessType, string> = {
  manufacturer: "Manufacturer",
  supplier: "Supplier",
  wholesaler: "Wholesaler",
  distributor: "Distributor",
  service_provider: "Service provider",
};

/**
 * Only shown for status "approved": it reflects TULAY's document review, nothing more. Links to the page that
 * explains the checks. relative z-10 keeps it clickable above a card's full-card link overlay.
 */
export function ApprovedBadge({ className }: { className?: string }) {
  return (
    <Link
      href="/how-we-verify"
      className={cn(
        "relative z-10 inline-flex w-fit items-center gap-1 rounded text-xs font-medium text-success underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        className,
      )}
      title="Business documents reviewed by TULAY. Not a quality guarantee."
    >
      <BadgeCheckIcon aria-hidden="true" className="size-3.5" />
      Approved supplier<span className="sr-only">: how TULAY verifies suppliers</span>
    </Link>
  );
}

/** Business card for directory, search and home. `mainProducts` = a few listing titles. */
export function SupplierCard({ supplier, mainProducts = [] }: { supplier: Supplier; mainProducts?: string[] }) {
  const s = supplier;
  return (
    <article className="group relative flex flex-col gap-3 rounded-lg border bg-card p-4 text-sm transition-shadow hover:shadow-md">
      <div className="flex items-start gap-3">
        <div
          aria-hidden="true"
          className="flex size-11 shrink-0 items-center justify-center rounded-md bg-accent text-primary"
        >
          <CategoryIcon slug={s.categorySlug} />
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 className="text-card-title truncate">
            {/* The overlay makes the whole card open the profile; buttons sit above it with relative z-10. */}
            <Link
              href={`/suppliers/${s.id}`}
              className="rounded-md outline-none after:absolute after:inset-0 group-hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:underline"
            >
              {s.businessName}
            </Link>
          </h3>
          <span className="text-xs text-muted-foreground">
            {BUSINESS_TYPE_LABEL[s.businessType]} · {categoryName(s.categorySlug)}
          </span>
          {s.status === "approved" && <ApprovedBadge />}
        </div>
        <SaveButton kind="supplier" id={s.id} label={s.businessName} className="relative z-10 ml-auto" />
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
        {/* min-w-0: lets the truncated product list shrink instead of widening the card past its column. */}
        {mainProducts.length > 0 && (
          <div className="flex min-w-0 gap-1">
            <dt className="text-muted-foreground">Main:</dt>
            <dd className="truncate">{mainProducts.join(", ")}</dd>
          </div>
        )}
      </dl>
      <div className="relative z-10 mt-auto flex flex-wrap gap-2">
        <Link
          href={`/messages?supplier=${s.id}&rfq=1`}
          className={cn(buttonVariants({ size: "sm" }), "min-w-0 grow basis-[calc(50%-0.25rem)]")}
        >
          Request quote
        </Link>
        <MessageSupplierButton supplierId={s.id} supplierName={s.businessName} className="min-w-0 grow basis-[calc(50%-0.25rem)]" />
      </div>
    </article>
  );
}
