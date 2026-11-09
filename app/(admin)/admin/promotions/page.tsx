import { PageHeader } from "@/components/common";
import { PROMOTIONS } from "@/lib/demo/data";
import { PromotionsClient } from "./promotions-client";

export const metadata = { title: "Homepage campaigns" };

const banners = [...PROMOTIONS].sort((a, b) => a.sortOrder - b.sortOrder);

export default function AdminPromotionsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Home page merchandising"
        title="Rotating promotional banners"
        description="Create editorial banners for categories and campaigns. Never imply paid sponsorship unless a real campaign exists."
      />
      <PromotionsClient banners={banners} />
    </>
  );
}
