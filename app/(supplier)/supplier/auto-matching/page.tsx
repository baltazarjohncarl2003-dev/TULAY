import { PageHeader } from "@/components/common";
import { DEMO_SUPPLIER } from "@/lib/demo/data";
import { DiscoveryForm } from "./discovery-form";

export const metadata = { title: "Automatic matching" };

export default function SupplierAutoMatchingPage() {
  return (
    <>
      <PageHeader
        eyebrow="Supplier automation"
        title="Receive matching requests automatically"
        description="Control whether TULAY may send you RFQs without an administrator manually assigning each one."
      />
      <DiscoveryForm supplier={DEMO_SUPPLIER} />
    </>
  );
}
