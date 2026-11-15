import { SavedItemsProvider } from "@/components/saved-items-provider";
import { listLiveProductsByIds, listMySaved, listSuppliers } from "@/lib/data/catalog";
import { SavedClient } from "./saved-client";

export const metadata = { title: "Saved" };

export default async function Page() {
  const saved = await listMySaved();
  // Look the saved products up by id so none fall outside a capped catalog load.
  const [{ products, suppliers: productSuppliers }, allSuppliers] = await Promise.all([
    listLiveProductsByIds(saved?.products ?? []),
    listSuppliers(),
  ]);
  const suppliers = [...new Map([...productSuppliers, ...allSuppliers].map((s) => [s.id, s])).values()];
  return (
    <SavedItemsProvider initial={saved}>
      <SavedClient products={products} suppliers={suppliers} />
    </SavedItemsProvider>
  );
}
