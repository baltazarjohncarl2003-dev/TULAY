import { AccountForm } from "@/components/account-form";
import { Notice } from "@/components/common";
import { requireRole } from "@/lib/auth";
import { getMyProfile } from "@/lib/data/account";
import { label } from "@/lib/format";

export const metadata = { title: "My Account" };

export default async function Page() {
  const [user, profile] = await Promise.all([requireRole("admin"), getMyProfile()]);
  return (
    <div className="flex flex-col gap-6">
      <Notice>
        Your admin roles:{" "}
        <strong>{user.subRoles.length ? user.subRoles.map(label).join(", ") : "none yet. Ask a super admin to grant one."}</strong>
      </Notice>
      <AccountForm profile={profile} role="admin" />
    </div>
  );
}
