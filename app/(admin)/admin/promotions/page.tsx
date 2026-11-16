import { EmptyState, PageHeader } from "@/components/common";

export const metadata = { title: "Homepage Campaigns" };

export default function AdminPromotionsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Home page merchandising"
        title="Homepage Campaigns"
        description="Rotating banners for categories and campaigns."
      />
      <EmptyState title="Coming soon">
        <p>Campaign banners are not available yet, so nothing can be saved here. Nothing is shown on the home page.</p>
      </EmptyState>
    </>
  );
}
