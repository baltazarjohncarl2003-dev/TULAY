import { type NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";

// One link for every account (`/messages?supplier=…&product=…`, `/messages?c=…`): sends signed-in users to
// their own workspace's Messages page with the same query, and visitors to sign-in first.
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  const search = req.nextUrl.search;
  const to = user ? `/${user.role}/messages${search}` : `/login?next=${encodeURIComponent(`/messages${search}`)}`;
  return NextResponse.redirect(new URL(to, req.url));
}
