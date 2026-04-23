import { promises as fs } from "node:fs";
import path from "node:path";
import { createId, safeFileName } from "@/lib/utils";

const root = path.join(process.cwd(), "storage");

const ensureDir = async (dirPath: string) => {
  await fs.mkdir(dirPath, { recursive: true });
};

export const getStorageRoot = async () => {
  await ensureDir(root);
  return root;
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

export const writeBuffer = async (
  folder: string,
  filename: string,
  content: Buffer | Uint8Array,
) => {
  const storageKey = path.posix.join(folder, `${createId()}-${safeFileName(filename)}`);
  const fullPath = await resolveStoragePath(storageKey);

  await ensureDir(path.dirname(fullPath));
  await fs.writeFile(fullPath, content);

  return storageKey;
};

export const writeStorageFile = async (
  storageKey: string,
  content: Buffer | Uint8Array | string,
) => {
  const fullPath = await resolveStoragePath(storageKey);
  await ensureDir(path.dirname(fullPath));
  await fs.writeFile(fullPath, content);
  return storageKey;
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
  const fromPath = await resolveStoragePath(fromStorageKey);
  const toPath = await resolveStoragePath(toStorageKey);
  await ensureDir(path.dirname(toPath));
  await fs.rename(fromPath, toPath);
  return toStorageKey;
};

export const removeStorageFile = async (storageKey: string) => {
  try {
    const fullPath = await resolveStoragePath(storageKey);
    await fs.rm(fullPath, { force: true });
  } catch {
    // Best effort cleanup.
  }
};

export const removeStoragePrefix = async (storageKeyPrefix: string) => {
  try {
    const fullPath = await resolveStoragePath(storageKeyPrefix);
    await fs.rm(fullPath, { force: true, recursive: true });
  } catch {
    // Best effort cleanup.
  }
};

export const storageUrl = (storageKey: string | null | undefined) =>
  storageKey ? `/api/media/${storageKey}` : null;

export const readStorageFile = async (storageKey: string) => {
  const fullPath = await resolveStoragePath(storageKey);
  return fs.readFile(fullPath);
};
