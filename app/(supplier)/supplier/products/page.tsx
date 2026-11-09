import { PageHeader } from "@/components/common";
import { DEMO_SUPPLIER, PRODUCTS } from "@/lib/demo/data";
import { ProductForm } from "./product-form";

export const metadata = { title: "My products" };

export default function SupplierProductsPage() {
  const approved = DEMO_SUPPLIER.status === "approved";
  const products = PRODUCTS.filter((p) => p.supplierId === DEMO_SUPPLIER.id);
  return (
    <>
      <PageHeader
        eyebrow="Supplier storefront"
        title="My product listings"
        description="Every listing is reviewed by TULAY before it goes public."
      />
      <ProductForm approved={approved} products={products} />
    </>
  );
}
