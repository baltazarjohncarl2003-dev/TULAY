import { SiteFooter, SiteHeader } from "@/components/site-header";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <div id="main" tabIndex={-1} className="flex flex-1 flex-col">{children}</div>
      <SiteFooter />
    </>
  );
}
