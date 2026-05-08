"use client";

export type SignedStorageUpload = {
  bucket: string;
  path: string;
  token: string;
  signedUrl: string;
};

export const uploadToSignedStorage = async (
  upload: SignedStorageUpload,
  file: File,
) => {
  const body = new FormData();
  body.append("cacheControl", "3600");
  body.append("", file);

  const response = await fetch(upload.signedUrl, {
    method: "PUT",
    headers: {
      "x-upsert": "false",
    },
    body,
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { message?: string } | null;
    throw new Error(
      `Failed to upload audio to storage: ${payload?.message ?? response.statusText}`,
    );
  }
};
