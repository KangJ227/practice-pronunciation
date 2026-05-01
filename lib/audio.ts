import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { promises as fs } from "node:fs";
import { appConfig } from "@/lib/config";
import { createId, extnameOr } from "@/lib/utils";
import { resolveStoragePath } from "@/lib/storage";

const execFileAsync = promisify(execFile);
const ffmpegPath = "/opt/homebrew/bin/ffmpeg";
const ffprobePath = "/opt/homebrew/bin/ffprobe";

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
  return {
    storageKey,
    fullPath,
    size: buffer.byteLength,
  };
};

export const probeDurationSeconds = async (fullPath: string) => {
  try {
    const { stdout } = await execFileAsync(ffprobePath, [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      fullPath,
    ]);

    const seconds = Number(stdout.trim());
    return Number.isFinite(seconds) ? seconds : null;
  } catch {
    return null;
  }
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

  await execFileAsync(ffmpegPath, [
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

  return outputPath;
};

export const convertToPlaybackMp3 = async (inputPath: string, outputStorageKey: string) => {
  const outputPath = await resolveStoragePath(outputStorageKey);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  await execFileAsync(ffmpegPath, [
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

  return outputPath;
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
