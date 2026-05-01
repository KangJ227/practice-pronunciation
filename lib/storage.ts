import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { appConfig } from "@/lib/config";
import { requireUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createId, extnameOr, safeFileName } from "@/lib/utils";

const tempRoot = path.join(os.tmpdir(), "french-pronunciation-storage");

const ensureDir = async (dirPath: string) => {
  await fs.mkdir(dirPath, { recursive: true });
};

const contentTypeFor = (storageKey: string) => {
  const extension = path.extname(storageKey).toLowerCase();
  if (extension === ".mp3") return "audio/mpeg";
  if (extension === ".wav") return "audio/wav";
  if (extension === ".webm") return "audio/webm";
  if (extension === ".ogg" || extension === ".opus") return "audio/ogg";
  if (extension === ".m4a") return "audio/mp4";
  if (extension === ".json") return "application/json";
  if (extension === ".md") return "text/markdown; charset=utf-8";
  if (extension === ".txt") return "text/plain; charset=utf-8";
  return "application/octet-stream";
};

export const getStorageRoot = async () => {
  await ensureDir(tempRoot);
  return tempRoot;
};

export const resolveStoragePath = async (storageKey: string) => {
  const storageRoot = await getStorageRoot();
  const fullPath = path.join(storageRoot, storageKey);
  const normalizedRoot = path.resolve(storageRoot);
  const normalizedFullPath = path.resolve(fullPath);

  if (!normalizedFullPath.startsWith(normalizedRoot)) {
    throw new Error("Invalid storage key.");
  }

  return normalizedFullPath;
};

export const scopeStorageKey = async (storageKey: string) => {
  const user = await requireUser();
  const normalized = storageKey.replace(/^\/+/, "");
  return normalized.startsWith(`${user.id}/`) ? normalized : path.posix.join(user.id, normalized);
};

export const writeBuffer = async (
  folder: string,
  filename: string,
  content: Buffer | Uint8Array,
) => {
  const storageKey = path.posix.join(folder, `${createId()}-${safeFileName(filename)}`);
  return writeStorageFile(storageKey, content);
};

export const createSignedStorageUpload = async (
  folder: string,
  originalFilename: string,
  nameHint = "upload",
) => {
  const extension = extnameOr(originalFilename, ".bin");
  const storageKey = path.posix.join(
    folder,
    `${createId()}-${safeFileName(nameHint)}${extension}`,
  );
  const scopedKey = await scopeStorageKey(storageKey);
  const { data, error } = await getSupabaseAdmin()
    .storage
    .from(appConfig.supabaseStorageBucket)
    .createSignedUploadUrl(scopedKey);

  if (error || !data?.signedUrl || !data.token) {
    throw new Error(error?.message ?? "Failed to create signed upload URL.");
  }

  return {
    bucket: appConfig.supabaseStorageBucket,
    storageKey: scopedKey,
    path: data.path ?? scopedKey,
    token: data.token,
    signedUrl: data.signedUrl,
  };
};

export const writeStorageFile = async (
  storageKey: string,
  content: Buffer | Uint8Array | string,
) => {
  const scopedKey = await scopeStorageKey(storageKey);
  const body = typeof content === "string" ? Buffer.from(content) : Buffer.from(content);
  const { error } = await getSupabaseAdmin()
    .storage
    .from(appConfig.supabaseStorageBucket)
    .upload(scopedKey, body, {
      contentType: contentTypeFor(scopedKey),
      upsert: true,
    });

  if (error) {
    throw new Error(`Failed to write storage object: ${error.message}`);
  }

  return scopedKey;
};

export const uploadLocalFile = async (storageKey: string, fullPath: string) => {
  const content = await fs.readFile(fullPath);
  return writeStorageFile(storageKey, content);
};

export const writeTempBuffer = async (suffix: string, content: Buffer | Uint8Array) => {
  const name = `${createId()}-${safeFileName(suffix)}`;
  const storageKey = path.posix.join("tmp", name);
  const fullPath = await resolveStoragePath(storageKey);
  await ensureDir(path.dirname(fullPath));
  await fs.writeFile(fullPath, content);
  return {
    storageKey,
    fullPath,
  };
};

export const moveStorageFile = async (fromStorageKey: string, toStorageKey: string) => {
  const scopedFrom = await scopeStorageKey(fromStorageKey);
  const scopedTo = await scopeStorageKey(toStorageKey);
  const bucket = getSupabaseAdmin().storage.from(appConfig.supabaseStorageBucket);
  const { error } = await bucket.move(scopedFrom, scopedTo);

  if (error) {
    throw new Error(`Failed to move storage object: ${error.message}`);
  }

  return scopedTo;
};

export const removeStorageFile = async (storageKey: string) => {
  try {
    const scopedKey = await scopeStorageKey(storageKey);
    await getSupabaseAdmin()
      .storage
      .from(appConfig.supabaseStorageBucket)
      .remove([scopedKey]);
  } catch {
    // Best effort cleanup.
  }
};

export const removeStoragePrefix = async (storageKeyPrefix: string) => {
  try {
    const scopedPrefix = await scopeStorageKey(storageKeyPrefix);
    const bucket = getSupabaseAdmin().storage.from(appConfig.supabaseStorageBucket);
    const collectKeys = async (prefix: string): Promise<string[]> => {
      const { data } = await bucket.list(prefix, { limit: 1000 });
      const keys: string[] = [];

      for (const item of data ?? []) {
        const key = path.posix.join(prefix, item.name);
        if (item.id === null) {
          keys.push(...await collectKeys(key));
        } else {
          keys.push(key);
        }
      }

      return keys;
    };

    const keys = await collectKeys(scopedPrefix);

    if (keys.length > 0) {
      await bucket.remove(keys);
    }
  } catch {
    // Best effort cleanup.
  }
};

export const storageUrl = (storageKey: string | null | undefined) =>
  storageKey ? `/api/media/${storageKey}` : null;

export const readStorageFile = async (storageKey: string) => {
  const scopedKey = await scopeStorageKey(storageKey);
  const { data, error } = await getSupabaseAdmin()
    .storage
    .from(appConfig.supabaseStorageBucket)
    .download(scopedKey);

  if (error) {
    throw new Error(`Failed to read storage object: ${error.message}`);
  }

  return Buffer.from(await data.arrayBuffer());
};

export const storageFileExists = async (storageKey: string) => {
  const scopedKey = await scopeStorageKey(storageKey);
  const { data, error } = await getSupabaseAdmin()
    .storage
    .from(appConfig.supabaseStorageBucket)
    .exists(scopedKey);

  if (error) {
    throw new Error(`Failed to check storage object: ${error.message}`);
  }

  return Boolean(data);
};

export const createSignedStorageUrl = async (storageKey: string, expiresInSeconds = 300) => {
  const scopedKey = await scopeStorageKey(storageKey);
  const { data, error } = await getSupabaseAdmin()
    .storage
    .from(appConfig.supabaseStorageBucket)
    .createSignedUrl(scopedKey, expiresInSeconds);

  if (error || !data?.signedUrl) {
    throw new Error(error?.message ?? "Failed to create signed media URL.");
  }

  return data.signedUrl;
};
