import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createSignedStorageUrl } from "@/lib/storage";

export async function GET(
  _request: Request,
  context: { params: Promise<{ storageKey: string[] }> },
) {
  try {
    const user = await requireUser();
    const { storageKey } = await context.params;
    const joined = storageKey.join("/");

    if (!joined.startsWith(`${user.id}/`)) {
      return new Response("Forbidden", { status: 403 });
    }

    const signedUrl = await createSignedStorageUrl(joined);
    return NextResponse.redirect(signedUrl);
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
