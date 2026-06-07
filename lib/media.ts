const elevenLabsSourcePathSegment = "/elevenlabs-source/";

export const resolveUserMediaStorageKey = (storageKey: string, userId: string) => {
  const normalized = storageKey.replace(/^\/+/, "");
  return normalized.startsWith(`${userId}/`) ? normalized : `${userId}/${normalized}`;
};

export const isElevenLabsSourceAudioPath = (storageKey: string | null | undefined) =>
  Boolean(storageKey?.includes(elevenLabsSourcePathSegment));
