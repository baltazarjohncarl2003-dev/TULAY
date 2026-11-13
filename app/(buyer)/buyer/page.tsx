import { BuyerDashboard } from "@/components/buyer-dashboard";
import { getSessionUser } from "@/lib/auth";

export const metadata = { title: "Overview" };

export default async function Page() {
  const user = await getSessionUser();
  const firstName = user?.fullName.trim().split(/\s+/)[0] || "there";
  return <BuyerDashboard firstName={firstName} />;
}
