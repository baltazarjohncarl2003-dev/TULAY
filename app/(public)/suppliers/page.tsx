import { approvedSuppliers } from "@/lib/demo/data";
import { SuppliersClient } from "./suppliers-client";

export const metadata = { title: "Suppliers" };

export default function SuppliersPage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-10">
      <SuppliersClient suppliers={approvedSuppliers()} />
    </main>
  );
}
