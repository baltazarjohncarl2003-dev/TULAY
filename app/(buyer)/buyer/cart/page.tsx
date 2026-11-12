import { PageHeader } from "@/components/common";
import { getCart, getCheckoutOptions } from "@/lib/data/orders";
import { CartClient } from "./cart-client";

export const metadata = { title: "Your cart" };

export default async function CartPage() {
  const [lines, options] = await Promise.all([getCart(), getCheckoutOptions()]);
  // Generated after the await (Cache Components rule). One key per page load, reused on retries.
  const idempotencyKey = crypto.randomUUID();
  return (
    <>
      <PageHeader title="Your cart" />
      <CartClient lines={lines} idempotencyKey={idempotencyKey} options={options} />
    </>
  );
}
