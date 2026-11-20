import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isPrefetch, MODE_COOKIE, modeForPath } from "@/lib/mode";
import { PATH_HEADER } from "@/lib/next-path";

// Refreshes the Supabase session cookie on every page request (Server Components can't write cookies).
// Authorization is not done here: role guards live in the workspace layouts and in RLS.
export async function proxy(request: NextRequest) {
  // Overwrites any client-sent value; consumers still validate it with safeNextPath.
  request.headers.set(PATH_HEADER, request.nextUrl.pathname + request.nextUrl.search);
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
        },
      },
    },
  );
  await supabase.auth.getClaims();
  // Remember the hub last used so the public ribbon shows Post a Request (buying) or Buyer Requests (selling).
  // Only real visits count: <Link> prefetches of hub links (footer, Switch button) must not flip the mode.
  const mode = isPrefetch(request.headers) ? null : modeForPath(request.nextUrl.pathname);
  if (mode && request.cookies.get(MODE_COOKIE)?.value !== mode) {
    response.cookies.set(MODE_COOKIE, mode, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
