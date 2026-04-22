import { clsx, type ClassValue } from "clsx";
import path from "node:path";
import { randomUUID } from "node:crypto";

export const cn = (...inputs: ClassValue[]) => clsx(inputs);

export const createId = () => randomUUID();

export const nowIso = () => new Date().toISOString();

export const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "item";

export const safeFileName = (value: string) =>
  value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-");

export const extnameOr = (filename: string, fallback: string) =>
  path.extname(filename).toLowerCase() || fallback;

export const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export const roundScore = (value: number | null | undefined) =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.round(value * 10) / 10
    : null;

export const jsonParse = <T>(value: string | null | undefined, fallback: T): T => {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

export const jsonStringify = (value: unknown) => JSON.stringify(value ?? null);
