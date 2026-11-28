import type { MetadataRoute } from "next";
import { listLiveProductRefs, listSuppliers } from "@/lib/data/catalog";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "http://127.0.0.1:3000";
const PAGES = ["", "/buyers", "/sell", "/marketplace", "/suppliers", "/requests", "/how-it-works", "/contact", "/terms", "/privacy", "/returns"];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [products, suppliers] = await Promise.all([listLiveProductRefs(), listSuppliers()]);
  return [
    ...PAGES.map((p) => ({ url: `${SITE}${p}` })),
    ...suppliers.map((s) => ({ url: `${SITE}/suppliers/${s.id}` })),
    ...products.map((p) => ({ url: `${SITE}/products/${p.id}`, lastModified: p.createdAt })),
  ];
}
