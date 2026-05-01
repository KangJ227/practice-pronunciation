import { NextResponse } from "next/server";
import { verifyUsernamePassword } from "@/lib/password-auth";
import {
  createSessionToken,
  sessionCookieName,
  sessionCookieOptions,
} from "@/lib/session";

const safeNext = (next: unknown) => {
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//")) {
    return "/";
  }
  return next;
};

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const username = typeof body?.username === "string" ? body.username : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const next = safeNext(body?.next);

  const user = await verifyUsernamePassword(username, password);
  if (!user) {
    return NextResponse.json({ error: "Invalid username or password." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true, next });
  response.cookies.set(sessionCookieName, await createSessionToken(user), sessionCookieOptions);
  return response;
}
