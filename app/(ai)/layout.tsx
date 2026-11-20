import { SiteHeader } from "@/components/site-header";

// Same header as the home page. No MobileBottomNav: the AI composer is pinned to the bottom of the screen.
export default function AiLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-background">
      <SiteHeader />
      {children}
    </div>
  );
}
