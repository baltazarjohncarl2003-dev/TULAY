import { PageHeader } from "@/components/common";
import { NotificationsList } from "@/components/notifications-list";
import { listMyNotifications } from "@/lib/data/notifications";

export const metadata = { title: "Notifications" };

export default async function SupplierNotificationsPage() {
  const notifications = await listMyNotifications();
  return (
    <>
      <PageHeader title="Notifications" description="Your latest 50 updates, newest first. Opening this page marks them read." />
      <NotificationsList notifications={notifications} />
    </>
  );
}
