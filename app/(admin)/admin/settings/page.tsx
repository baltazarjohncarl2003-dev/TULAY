import { Notice, PageHeader } from "@/components/common";
import { canAdmin, requireRole } from "@/lib/auth";
import { listBannedTerms, listCommissionSchedules, listSearchSynonyms, listSettings, listTermsTemplates } from "@/lib/data/admin";
import { SettingsClient } from "./settings-client";
import { TermsEditor } from "./terms-editor";

export const metadata = { title: "Settings" };

export default async function Page() {
  const [user, settings, schedules, synonyms, bannedTerms, terms] = await Promise.all([
    requireRole("admin"),
    listSettings(),
    listCommissionSchedules(),
    listSearchSynonyms(),
    listBannedTerms(),
    listTermsTemplates(),
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
          Only super admins can change settings, finance admins can schedule commission and verifiers can edit search synonyms and banned items. Every change is logged.
        </Notice>
        <SettingsClient
          settings={settings}
          schedules={schedules}
          synonyms={synonyms}
          bannedTerms={bannedTerms}
          can={{ settings: canAdmin(user, "super_admin"), schedule: canAdmin(user, "finance"), synonyms: canAdmin(user, "verifier") }}
        />
        <TermsEditor terms={terms} canEdit={canAdmin(user, "super_admin")} />
      </div>
    </>
  );
}
