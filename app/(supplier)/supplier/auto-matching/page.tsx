import Link from "next/link";
import { Notice, PageHeader } from "@/components/common";
import { getSessionUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DiscoveryForm } from "./discovery-form";

export const metadata = { title: "Automatic matching" };

export default async function SupplierAutoMatchingPage() {
  const user = await getSessionUser();
  const supabase = await createClient();
  const { data: s, error } = await supabase
    .from("suppliers")
    .select("id, status, auto_invites, delivery_areas, keywords, max_quantity")
    .eq("owner_id", user?.id ?? "")
    .maybeSingle();
  if (error) throw new Error(error.message);

  return (
    <>
      <PageHeader
        eyebrow="Supplier automation"
        title="Receive matching requests automatically"
        description="Control whether TULAY may send you RFQs without an administrator manually assigning each one."
      />
      {s ? (
        <DiscoveryForm
          approved={s.status === "verified"} // DB value; the UI calls this "approved"
          autoInvites={s.auto_invites}
          deliveryAreas={s.delivery_areas.join(", ")}
          keywords={s.keywords}
          maxQuantity={s.max_quantity}
        />
      ) : (
        <Notice>
          <Link href="/supplier/profile" className="text-primary underline">
            Apply as a supplier first
          </Link>
        </Notice>
      )}
    </>
  );
}
