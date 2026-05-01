import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { appConfig } from "@/lib/config";

const isPublicPath = (pathname: string) =>
  pathname === "/login" ||
  pathname === "/auth/callback" ||
  pathname.startsWith("/_next/") ||
  pathname === "/favicon.ico";

const unauthorized = (status: 401 | 403 | 500, message: string) =>
  NextResponse.json({ error: message, details: null }, { status });

const isAllowedUser = (user: { email?: string | null } | null) =>
  Boolean(
    user?.email &&
      appConfig.allowedLoginEmail &&
      user.email.toLowerCase() === appConfig.allowedLoginEmail,
  );

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  let response = NextResponse.next({
    request,
  });

  if (!appConfig.supabaseUrl || !appConfig.supabasePublishableKey) {
    return pathname.startsWith("/api/")
      ? unauthorized(500, "Supabase is not configured.")
      : NextResponse.redirect(new URL("/login", request.url));
  }

  const supabase = createServerClient(
    appConfig.supabaseUrl,
    appConfig.supabasePublishableKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    if (pathname.startsWith("/api/")) {
      return unauthorized(401, "Authentication required.");
    }

    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(loginUrl);
  }

  if (!isAllowedUser(user)) {
    await supabase.auth.signOut();

    if (pathname.startsWith("/api/")) {
      return unauthorized(403, "This account is not allowed to use this app.");
    }

    return NextResponse.redirect(new URL("/login?denied=1", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
