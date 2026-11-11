import { SavedItemsProvider } from "@/components/saved-items-provider";
import { listLiveCatalog, listMySaved } from "@/lib/data/catalog";
import { SavedClient } from "./saved-client";

export const metadata = { title: "Saved" };

export default async function Page() {
  const [{ products, suppliers }, saved] = await Promise.all([listLiveCatalog(), listMySaved()]);
  return (
    <SavedItemsProvider initial={saved}>
      <SavedClient products={products} suppliers={suppliers} />
    </SavedItemsProvider>
  );
}
