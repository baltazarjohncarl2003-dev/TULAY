import { PageHeader } from "@/components/common";
import { getCart, getCheckoutOptions, getOpenCheckout } from "@/lib/data/orders";
import { getNumberSettings } from "@/lib/data/settings";
import { CartClient } from "./cart-client";

export const metadata = { title: "Your Cart" };

export default async function CartPage() {
  const [lines, options, settings, openCheckout] = await Promise.all([
    getCart(),
    getCheckoutOptions(),
    getNumberSettings(["checkout_ttl_minutes"]),
    getOpenCheckout(),
  ]);
  // Generated after the await (Cache Components rule). One key per page load, reused on retries.
  const idempotencyKey = crypto.randomUUID();
  return (
    <>
      <PageHeader title="Your Cart" />
      <CartClient lines={lines} idempotencyKey={idempotencyKey} options={options} holdMinutes={settings.checkout_ttl_minutes} openCheckout={openCheckout} />
    </>
  );
}
