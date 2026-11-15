import { Notice, PageHeader } from "@/components/common";
import { canAdmin, requireRole } from "@/lib/auth";
import { listCommissionSchedules, listSearchSynonyms, listSettings } from "@/lib/data/admin";
import { SettingsClient } from "./settings-client";

export const metadata = { title: "Settings" };

export default async function Page() {
  const [user, settings, schedules, synonyms] = await Promise.all([
    requireRole("admin"),
    listSettings(),
    listCommissionSchedules(),
    listSearchSynonyms(),
  ]);
  return (
    <>
      <PageHeader
        eyebrow="Platform"
        title="Settings"
        description="Business values the app reads instead of hardcoding."
      />
      <div className="flex flex-col gap-6">
        <Notice>
          Only super admins can change settings, finance admins can schedule commission and verifiers can edit search synonyms. Every change is logged.
        </Notice>
        <SettingsClient
          settings={settings}
          schedules={schedules}
          synonyms={synonyms}
          can={{ settings: canAdmin(user, "super_admin"), schedule: canAdmin(user, "finance"), synonyms: canAdmin(user, "verifier") }}
        />
      </div>
    </>
  );
}
