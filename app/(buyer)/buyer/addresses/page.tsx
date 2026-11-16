import { PageHeader } from "@/components/common";
import { listMyAddresses, listProvinces } from "@/lib/data/orders";
import { AddressBook } from "./address-book";

export const metadata = { title: "Delivery Addresses" };

export default async function AddressesPage() {
  const [addresses, provinces] = await Promise.all([listMyAddresses(), listProvinces()]);
  return (
    <>
      <PageHeader title="Delivery Addresses" />
      <AddressBook addresses={addresses} provinces={provinces} />
    </>
  );
}
