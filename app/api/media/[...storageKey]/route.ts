import path from "node:path";
import { promises as fs } from "node:fs";
import { resolveStoragePath } from "@/lib/storage";

const contentTypeFor = (storageKey: string) => {
  const extension = path.extname(storageKey).toLowerCase();

  if (extension === ".mp3") {
    return "audio/mpeg";
  }

  if (extension === ".wav") {
    return "audio/wav";
  }

  if (extension === ".m4a") {
    return "audio/mp4";
  }

  if (extension === ".ogg") {
    return "audio/ogg";
  }

  if (extension === ".webm") {
    return "audio/webm";
  }

  if (extension === ".txt") {
    return "text/plain; charset=utf-8";
  }

  if (extension === ".json") {
    return "application/json; charset=utf-8";
  }

  if (extension === ".md") {
    return "text/markdown; charset=utf-8";
  }

  return "application/octet-stream";
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ storageKey: string[] }> },
) {
  try {
    const { storageKey } = await context.params;
    const joined = storageKey.join("/");
    const fullPath = await resolveStoragePath(joined);
    const file = await fs.readFile(fullPath);

    return new Response(file, {
      headers: {
        "Content-Type": contentTypeFor(joined),
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
