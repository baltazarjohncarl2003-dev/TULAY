import { Suspense } from "react";
import { CompareTray } from "@/components/compare-tray";
import { SavedItemsProvider } from "@/components/saved-items-provider";
import { MobileBottomNav, SiteFooter, SiteHeader } from "@/components/site-header";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <SavedItemsProvider>
      <SiteHeader />
      <div id="main" tabIndex={-1} className="flex flex-1 flex-col bg-surface outline-none">
        {children}
      </div>
      <SiteFooter />
      <MobileBottomNav />
      <Suspense fallback={null}>
        <CompareTray />
      </Suspense>
    </SavedItemsProvider>
  );
}
