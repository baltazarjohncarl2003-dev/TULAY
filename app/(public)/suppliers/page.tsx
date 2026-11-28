import { Suspense } from "react";
import { CATEGORIES } from "@/lib/categories";
import { getCatalogOverview, listSuppliers } from "@/lib/data/catalog";
import { SuppliersClient } from "./suppliers-client";

export const metadata = { title: "Suppliers" };

export default async function SuppliersPage() {
  const [suppliers, overview] = await Promise.all([listSuppliers(), getCatalogOverview()]);
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6">
      <Suspense fallback={null}>
        <SuppliersClient suppliers={suppliers} tiles={overview.tilesBySupplier} categories={CATEGORIES} />
      </Suspense>
    </main>
  );
}
