import { CompareTray } from "@/components/compare-tray";
import { MobileBottomNav, SiteFooter, SiteHeader } from "@/components/site-header";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      {/* shortcut: site-wide notice while every listing is demo data; remove when Stage 2 reads real listings. */}
      <p role="note" className="bg-warning/15 px-4 py-1.5 text-center text-xs text-foreground">
        Prototype: suppliers, listings and prices shown are sample data, not real businesses or offers.
      </p>
      <div className="flex flex-1 flex-col bg-surface">{children}</div>
      <SiteFooter />
      <MobileBottomNav />
      <CompareTray />
    </>
  );
}
