import { NextResponse } from "next/server";
import { isAllowedUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next") || "/";

  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!isAllowedUser(user)) {
      await supabase.auth.signOut();
      return NextResponse.redirect(new URL("/login?denied=1", request.url));
    }
  }

  return NextResponse.redirect(new URL(next, request.url));
}
