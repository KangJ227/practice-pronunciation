import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { ensurePlaybackMp3 } from "@/lib/audio";
import { createSignedStorageUrl, readStorageFile } from "@/lib/storage";

export const runtime = "nodejs";
export const maxDuration = 120;

const contentTypeFor = (storageKey: string) => {
  const extension = storageKey.split(".").pop()?.toLowerCase();
  if (extension === "mp3") return "audio/mpeg";
  if (extension === "wav") return "audio/wav";
  if (extension === "webm") return "audio/webm";
  if (extension === "ogg" || extension === "opus") return "audio/ogg";
  if (extension === "m4a") return "audio/mp4";
  if (extension === "json") return "application/json";
  if (extension === "md") return "text/markdown; charset=utf-8";
  if (extension === "txt") return "text/plain; charset=utf-8";
  return "application/octet-stream";
};

const canProxyDownload = (storageKey: string) => {
  const extension = storageKey.split(".").pop()?.toLowerCase();
  return extension === "json" || extension === "md" || extension === "txt";
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

    const mediaStorageKey = await ensurePlaybackMp3(joined);
    const requestUrl = new URL(request.url);
    if (requestUrl.searchParams.get("download") === "1" && canProxyDownload(mediaStorageKey)) {
      const file = await readStorageFile(mediaStorageKey);
      return new Response(file, {
        headers: {
          "cache-control": "private, max-age=31536000, immutable",
          "content-length": String(file.byteLength),
          "content-type": contentTypeFor(mediaStorageKey),
        },
      });
    }

    const signedUrl = await createSignedStorageUrl(mediaStorageKey);
    return NextResponse.redirect(signedUrl);
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
