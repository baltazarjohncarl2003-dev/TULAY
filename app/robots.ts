import type { MetadataRoute } from "next";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "http://127.0.0.1:3000";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/buyer", "/supplier", "/admin", "/login", "/register", "/mfa", "/reset-password", "/auth", "/pay", "/ship", "/api"],
    },
    sitemap: `${SITE}/sitemap.xml`,
  };
}
