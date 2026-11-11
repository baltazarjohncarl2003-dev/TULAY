import { CompareTray } from "@/components/compare-tray";
import { SavedItemsProvider } from "@/components/saved-items-provider";
import { MobileBottomNav, SiteFooter, SiteHeader } from "@/components/site-header";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <SavedItemsProvider>
      <SiteHeader />
      <div className="flex flex-1 flex-col bg-surface">{children}</div>
      <SiteFooter />
      <MobileBottomNav />
      <CompareTray />
    </SavedItemsProvider>
  );
}
