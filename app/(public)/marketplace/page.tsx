import { Suspense } from "react";
import { CATEGORIES, approvedSuppliers, publicProducts } from "@/lib/demo/data";
import { MarketplaceClient } from "./marketplace-client";

export const metadata = { title: "Marketplace" };

export default function MarketplacePage() {
  return (
    <Suspense fallback={null}>
      <MarketplaceClient products={publicProducts()} suppliers={approvedSuppliers()} categories={CATEGORIES} />
    </Suspense>
  );
}
