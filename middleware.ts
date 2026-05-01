import { NextResponse, type NextRequest } from "next/server";

const sessionCookieName = "practice_session";
const encoder = new TextEncoder();

const isPublicPath = (pathname: string) =>
  pathname === "/login" ||
  pathname === "/auth/callback" ||
  pathname === "/api/login" ||
  pathname.startsWith("/_next/") ||
  pathname === "/favicon.ico";

const unauthorized = (status: 401 | 403 | 500, message: string) =>
  NextResponse.json({ error: message, details: null }, { status });

const sessionSecret = () =>
  process.env.APP_SESSION_SECRET || process.env.AUTH_SECRET || "";

const sign = async (data: string) => {
  const secret = sessionSecret();
  if (!secret) {
    return "";
  }

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  const bytes = Array.from(new Uint8Array(signature), (byte) =>
    String.fromCharCode(byte),
  ).join("");
  return btoa(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const isValidSessionCookie = async (token: string | undefined) => {
  if (!token) {
    return false;
  }

  const [payload, signature] = token.split(".");
  if (!payload || !signature) {
    return false;
  }

  if (signature !== await sign(payload)) {
    return false;
  }

  try {
    const decodedPayload = payload.replace(/-/g, "+").replace(/_/g, "/");
    const paddedPayload = decodedPayload.padEnd(
      decodedPayload.length + ((4 - (decodedPayload.length % 4)) % 4),
      "=",
    );
    const parsed = JSON.parse(atob(paddedPayload)) as { exp?: number };
    return Boolean(parsed.exp && parsed.exp >= Math.floor(Date.now() / 1000));
  } catch {
    return false;
  }
};

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  if (!(await isValidSessionCookie(request.cookies.get(sessionCookieName)?.value))) {
    if (pathname.startsWith("/api/")) {
      return unauthorized(401, "Authentication required.");
    }

    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next({ request });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
