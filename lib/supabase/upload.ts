"use client";

import { createClient } from "@/lib/supabase/browser";

export type SignedStorageUpload = {
  bucket: string;
  path: string;
  token: string;
};

export const uploadToSignedStorage = async (
  upload: SignedStorageUpload,
  file: File,
) => {
  const supabase = createClient();
  const { error } = await supabase
    .storage
    .from(upload.bucket)
    .uploadToSignedUrl(upload.path, upload.token, file, {
      contentType: file.type || "application/octet-stream",
    });

  if (error) {
    throw new Error(`Failed to upload audio to storage: ${error.message}`);
  }
};
