import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createSignedStorageUrl, readStorageFile } from "@/lib/storage";

const contentTypeFor = (storageKey: string) => {
  const extension = storageKey.split(".").pop()?.toLowerCase();
  if (extension === "mp3") return "audio/mpeg";
  if (extension === "wav") return "audio/wav";
  if (extension === "webm") return "audio/webm";
  if (extension === "ogg" || extension === "opus") return "audio/ogg";
  if (extension === "m4a") return "audio/mp4";
  return "application/octet-stream";
};

export async function GET(
  request: Request,
  context: { params: Promise<{ storageKey: string[] }> },
) {
  try {
    const user = await requireUser();
    const { storageKey } = await context.params;
    const joined = storageKey.join("/");

    if (!joined.startsWith(`${user.id}/`)) {
      return new Response("Forbidden", { status: 403 });
    }

    const requestUrl = new URL(request.url);
    if (requestUrl.searchParams.get("download") === "1") {
      const file = await readStorageFile(joined);
      return new Response(file, {
        headers: {
          "cache-control": "private, max-age=31536000, immutable",
          "content-length": String(file.byteLength),
          "content-type": contentTypeFor(joined),
        },
      });
    }

    const signedUrl = await createSignedStorageUrl(joined);
    return NextResponse.redirect(signedUrl);
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
