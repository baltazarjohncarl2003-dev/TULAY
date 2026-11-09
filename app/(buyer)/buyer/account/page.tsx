import { AccountForm } from "@/components/account-form";
import { DEMO_USERS } from "@/lib/demo/data";

export const metadata = { title: "My account" };

export default function Page() {
  return <AccountForm profile={DEMO_USERS.buyer} role="buyer" />;
}
