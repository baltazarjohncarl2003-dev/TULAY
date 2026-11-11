import { PageHeader } from "@/components/common";
import { listMyProducts } from "@/lib/data/catalog";
import { ProductForm } from "./product-form";

export const metadata = { title: "My products" };

export default async function SupplierProductsPage() {
  const { supplierId, canList, products } = await listMyProducts();
  // A fresh key per render: a double submit reuses it (one draft); the refresh after a save brings a new one.
  const newProductKey = crypto.randomUUID();
  return (
    <>
      <PageHeader
        eyebrow="Supplier storefront"
        title="My product listings"
        description="Every listing is reviewed by TULAY before it goes public."
      />
      <ProductForm supplierId={supplierId} canList={canList} products={products} newProductKey={newProductKey} />
    </>
  );
}
