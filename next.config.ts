import type { NextConfig } from "next";

// Supabase storage host for next/image. The local stack sits on a private IP, which the optimizer refuses unless allowed.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL) : null;
const localSupabase = supabaseUrl !== null && ["127.0.0.1", "localhost"].includes(supabaseUrl.hostname);

const isDev = process.env.NODE_ENV === "development";
// The Vercel toolbar (comments on preview deployments) loads from vercel.live; allowed on previews only.
const preview = process.env.VERCEL_ENV === "preview";
const supabaseOrigin = supabaseUrl?.origin ?? "";
const supabaseSocket = supabaseOrigin.replace(/^http/, "ws"); // realtime chat

// No nonces: they would make every page render per request and lose the cached public catalog (Cache
// Components). Inline scripts therefore stay allowed; the policy still blocks scripts, frames, plugins, form
// posts and background requests to any host that is not ours, Supabase or the map tiles.
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}${preview ? " https://vercel.live" : ""}`, // React needs eval in development only
  `style-src 'self' 'unsafe-inline'${preview ? " https://vercel.live" : ""}`,
  `img-src 'self' data: blob: https://*.tile.openstreetmap.org ${supabaseOrigin}${preview ? " https://vercel.live https://vercel.com" : ""}`,
  `font-src 'self'${preview ? " https://vercel.live https://assets.vercel.com" : ""}`,
  `connect-src 'self' ${supabaseOrigin} ${supabaseSocket}${preview ? " https://vercel.live wss://ws-us3.pusher.com" : ""}`,
  `frame-src ${preview ? "https://vercel.live" : "'none'"}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
]
  .map((d) => d.replace(/\s+/g, " ").trim())
  .join("; ");

// Sent on every response: a content security policy, no framing (clickjacking of sign-in, refunds, payouts),
// no MIME sniffing, HTTPS only once deployed, and no camera/mic for any page. Location only for our own pages
// (the map pin's "Use my location" on addresses and pickup settings); embedded third-party frames still get none.
const SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: CSP },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self), payment=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // NEXT_PUBLIC_SITE_URL and email links use 127.0.0.1; without this the dev server blocks JS there and forms never hydrate.
  allowedDevOrigins: ["127.0.0.1"],
  images: {
    remotePatterns: supabaseUrl
      ? [
          {
            protocol: supabaseUrl.protocol === "https:" ? "https" : "http",
            hostname: supabaseUrl.hostname,
            port: supabaseUrl.port,
            pathname: "/storage/v1/object/public/**",
          },
        ]
      : [],
    dangerouslyAllowLocalIP: localSupabase,
  },
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
