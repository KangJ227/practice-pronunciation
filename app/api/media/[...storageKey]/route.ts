import path from "node:path";
import { promises as fs } from "node:fs";
import { convertToPlaybackMp3 } from "@/lib/audio";
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

const sourcePlaybackExtensions = new Set([".ogg", ".opus", ".webm"]);

const sourcePlaybackStorageKey = (storageKey: string) => {
  const parts = storageKey.split("/");
  const extension = path.extname(storageKey).toLowerCase();

  if (
    parts.length >= 4 &&
    parts[0] === "materials" &&
    parts[2] === "source" &&
    sourcePlaybackExtensions.has(extension)
  ) {
    const filename = `${path.basename(storageKey, extension)}.mp3`;
    return path.posix.join("materials", parts[1], "playback", filename);
  }

  return null;
};

const statOrNull = async (fullPath: string) => {
  try {
    return await fs.stat(fullPath);
  } catch {
    return null;
  }
};

const resolvePlayableMedia = async (storageKey: string) => {
  const originalPath = await resolveStoragePath(storageKey);
  const playbackKey = sourcePlaybackStorageKey(storageKey);

  if (!playbackKey) {
    return {
      storageKey,
      fullPath: originalPath,
    };
  }

  const playbackPath = await resolveStoragePath(playbackKey);
  const [originalStat, playbackStat] = await Promise.all([
    fs.stat(originalPath),
    statOrNull(playbackPath),
  ]);

  if (!playbackStat || playbackStat.mtimeMs < originalStat.mtimeMs) {
    await convertToPlaybackMp3(originalPath, playbackKey);
  }

  return {
    storageKey: playbackKey,
    fullPath: playbackPath,
  };
};

const parseRange = (rangeHeader: string | null, size: number) => {
  if (!rangeHeader) {
    return null;
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!match) {
    return "invalid" as const;
  }

  const [, startText, endText] = match;
  if (!startText && !endText) {
    return "invalid" as const;
  }

  if (!startText) {
    const suffixLength = Number(endText);
    if (!Number.isInteger(suffixLength) || suffixLength <= 0) {
      return "invalid" as const;
    }

    return {
      start: Math.max(size - suffixLength, 0),
      end: size - 1,
    };
  }

  const start = Number(startText);
  const end = endText ? Number(endText) : size - 1;
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    end < start ||
    start >= size
  ) {
    return "invalid" as const;
  }

  return {
    start,
    end: Math.min(end, size - 1),
  };
};

export async function GET(
  request: Request,
  context: { params: Promise<{ storageKey: string[] }> },
) {
  try {
    const { storageKey } = await context.params;
    const joined = storageKey.join("/");
    const media = await resolvePlayableMedia(joined);
    const file = await fs.readFile(media.fullPath);
    const range = parseRange(request.headers.get("range"), file.byteLength);
    const contentType = contentTypeFor(media.storageKey);

    if (range === "invalid") {
      return new Response(null, {
        status: 416,
        headers: {
          "Content-Range": `bytes */${file.byteLength}`,
          "Accept-Ranges": "bytes",
        },
      });
    }

    if (range) {
      const body = file.subarray(range.start, range.end + 1);
      return new Response(body, {
        status: 206,
        headers: {
          "Content-Type": contentType,
          "Content-Length": String(body.byteLength),
          "Content-Range": `bytes ${range.start}-${range.end}/${file.byteLength}`,
          "Accept-Ranges": "bytes",
          "Cache-Control": "no-store",
        },
      });
    }

    return new Response(file, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(file.byteLength),
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
