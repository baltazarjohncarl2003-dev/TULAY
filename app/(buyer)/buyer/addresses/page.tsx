import { PageHeader } from "@/components/common";
import { listMyAddresses } from "@/lib/data/orders";
import { AddressBook } from "./address-book";

export const metadata = { title: "Delivery addresses" };

export default async function AddressesPage() {
  const addresses = await listMyAddresses();
  return (
    <>
      <PageHeader title="Delivery addresses" />
      <AddressBook addresses={addresses} />
    </>
  );
}
