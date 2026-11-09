import { AccountForm } from "@/components/account-form";
import { getMyProfile } from "@/lib/data/account";

export const metadata = { title: "My account" };

export default async function Page() {
  const profile = await getMyProfile();
  return <AccountForm profile={profile} role="buyer" />;
}
