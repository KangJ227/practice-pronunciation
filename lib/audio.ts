import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { promises as fs } from "node:fs";
import { createRequire } from "node:module";
import { appConfig } from "@/lib/config";
import { createId, extnameOr } from "@/lib/utils";
import {
  readStorageFile,
  resolveStoragePath,
  storageFileExists,
  uploadLocalFile,
  writeStorageFile,
  writeTempBuffer,
} from "@/lib/storage";

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
const maxFfmpegOutputBuffer = 10 * 1024 * 1024;

type ExecFileError = Error & {
  code?: string;
  stderr?: string | Buffer;
  stdout?: string | Buffer;
};

const bundledFfmpegPath = () => {
  try {
    return (require("@ffmpeg-installer/ffmpeg") as { path?: string }).path ?? null;
  } catch {
    return null;
  }
};

const ffmpegCandidates = () =>
  [
    process.env.FFMPEG_PATH?.trim(),
    bundledFfmpegPath(),
    "ffmpeg",
  ].filter((candidate, index, candidates): candidate is string =>
    Boolean(candidate && candidates.indexOf(candidate) === index),
  );

const errorOutput = (error: unknown) => {
  const execError = error as ExecFileError;
  const output = execError.stderr || execError.stdout || execError.message || "";
  return String(output)
    .trim()
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-4)
    .join(" ");
};

const runFfmpeg = async (args: string[]) => {
  const candidates = ffmpegCandidates();
  let missingBinaryError: unknown = null;

  for (const candidate of candidates) {
    try {
      return await execFileAsync(candidate, args, {
        maxBuffer: maxFfmpegOutputBuffer,
      });
    } catch (error) {
      if ((error as ExecFileError).code === "ENOENT") {
        missingBinaryError = error;
        continue;
      }

      throw error;
    }
  }

  const detail = errorOutput(missingBinaryError);
  throw new Error(
    `ffmpeg is not available in this runtime. Install project dependencies or set FFMPEG_PATH.${detail ? ` ${detail}` : ""}`,
  );
};

const parseDurationSeconds = (output: string) => {
  const match = output.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!match) {
    return null;
  }

  const [, hours, minutes, seconds] = match;
  return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
};

const convertablePlaybackExtensions = new Set([".ogg", ".opus", ".webm"]);

export const shouldConvertToPlaybackMp3 = (storageKey: string) =>
  convertablePlaybackExtensions.has(path.extname(storageKey).toLowerCase());

const playbackMp3StorageKey = (storageKey: string) => {
  const extension = path.extname(storageKey);
  return path.posix.join(
    path.posix.dirname(storageKey),
    "playback",
    `${path.posix.basename(storageKey, extension)}.mp3`,
  );
};

export const saveUploadedFile = async (
  file: File,
  folder: string,
  nameHint: string,
) => {
  const extension = extnameOr(file.name, ".bin");
  const storageKey = path.posix.join(folder, `${createId()}-${nameHint}${extension}`);
  const fullPath = await resolveStoragePath(storageKey);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(fullPath, buffer);
  const persistedStorageKey = await writeStorageFile(storageKey, buffer);
  return {
    storageKey: persistedStorageKey,
    fullPath,
    size: buffer.byteLength,
  };
};

export const probeDurationSeconds = async (fullPath: string) => {
  try {
    await runFfmpeg([
      "-hide_banner",
      "-i",
      fullPath,
    ]);
  } catch (error) {
    return parseDurationSeconds(errorOutput(error));
  }

  return null;
};

export const assertDurationWithinLimit = async (
  fullPath: string,
  maxSeconds: number,
  message: string,
) => {
  const durationSeconds = await probeDurationSeconds(fullPath);

  if (durationSeconds !== null && durationSeconds > maxSeconds) {
    throw new Error(message);
  }

  return durationSeconds;
};

export const convertToMonoWav = async (inputPath: string, outputStorageKey: string) => {
  const outputPath = await resolveStoragePath(outputStorageKey);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  try {
    await runFfmpeg([
      "-y",
      "-i",
      inputPath,
      "-ac",
      "1",
      "-ar",
      "16000",
      "-f",
      "wav",
      outputPath,
    ]);
  } catch (error) {
    throw new Error(`Audio conversion to WAV failed: ${errorOutput(error) || String(error)}`);
  }

  await uploadLocalFile(outputStorageKey, outputPath);
  return outputPath;
};

export const convertToPlaybackMp3 = async (inputPath: string, outputStorageKey: string) => {
  const outputPath = await resolveStoragePath(outputStorageKey);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  try {
    await runFfmpeg([
      "-y",
      "-i",
      inputPath,
      "-vn",
      "-codec:a",
      "libmp3lame",
      "-b:a",
      "128k",
      "-f",
      "mp3",
      outputPath,
    ]);
  } catch (error) {
    throw new Error(`Audio conversion to MP3 failed: ${errorOutput(error) || String(error)}`);
  }

  await uploadLocalFile(outputStorageKey, outputPath);
  return outputPath;
};

export const ensurePlaybackMp3 = async (storageKey: string) => {
  if (!shouldConvertToPlaybackMp3(storageKey)) {
    return storageKey;
  }

  const outputStorageKey = playbackMp3StorageKey(storageKey);

  try {
    if (await storageFileExists(outputStorageKey)) {
      return outputStorageKey;
    }
  } catch {
    // Fall through and refresh the derived media object.
  }

  try {
    await readStorageFile(outputStorageKey);
    return outputStorageKey;
  } catch {
    // Cache miss: transcode below and upload the MP3 next to the original object.
  }

  const input = await writeTempBuffer(
    path.posix.basename(storageKey),
    await readStorageFile(storageKey),
  );
  let outputPath: string | null = null;

  try {
    outputPath = await convertToPlaybackMp3(input.fullPath, outputStorageKey);
    return outputStorageKey;
  } finally {
    await Promise.all([
      fs.unlink(input.fullPath).catch(() => undefined),
      outputPath ? fs.unlink(outputPath).catch(() => undefined) : Promise.resolve(),
    ]);
  }
};

export const ensureAttemptAudioLimit = async (fullPath: string) =>
  assertDurationWithinLimit(
    fullPath,
    appConfig.maxAttemptSeconds,
    `Practice audio must be ${appConfig.maxAttemptSeconds} seconds or shorter.`,
  );

export const ensureMaterialAudioLimit = async (fullPath: string) =>
  assertDurationWithinLimit(
    fullPath,
    appConfig.maxAudioMinutes * 60,
    `Uploaded audio must be ${appConfig.maxAudioMinutes} minutes or shorter.`,
  );
