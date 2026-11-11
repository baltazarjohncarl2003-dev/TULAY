import { approvedSuppliers, publicProducts } from "@/lib/demo/data";
import { SavedClient } from "./saved-client";

export const metadata = { title: "Saved" };

export default function Page() {
  return <SavedClient products={publicProducts()} suppliers={approvedSuppliers()} />;
}
