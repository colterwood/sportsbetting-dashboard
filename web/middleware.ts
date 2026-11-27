import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { authToken, AUTH_COOKIE } from "@/lib/auth";

// Shared-password gate. Disabled unless SITE_PASSWORD is set (local dev stays open).
// /api/* is excluded — /api/revalidate is gated by its own RECOMPUTE_TOKEN so the
// build scripts can reach it.
export async function middleware(req: NextRequest) {
  const pw = process.env.SITE_PASSWORD;
  if (!pw) return NextResponse.next();

  const cookie = req.cookies.get(AUTH_COOKIE)?.value;
  if (cookie && cookie === (await authToken(pw))) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?from=${encodeURIComponent(req.nextUrl.pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|login|api/).*)"],
};
