import { Notice, PageHeader } from "@/components/common";
import { listCommissionSchedules, listSettings } from "@/lib/data/admin";
import { SettingsClient } from "./settings-client";

export const metadata = { title: "Settings" };

export default async function Page() {
  const [settings, schedules] = await Promise.all([listSettings(), listCommissionSchedules()]);
  return (
    <>
      <PageHeader
        eyebrow="Platform"
        title="Settings"
        description="Business values the app reads instead of hardcoding."
      />
      <div className="flex flex-col gap-6">
        <Notice>
          Only super admins can change settings and only finance admins can schedule commission. Every change is logged.
        </Notice>
        <SettingsClient settings={settings} schedules={schedules} />
      </div>
    </>
  );
}
