export const resolveUserMediaStorageKey = (storageKey: string, userId: string) => {
  const normalized = storageKey.replace(/^\/+/, "");
  return normalized.startsWith(`${userId}/`) ? normalized : `${userId}/${normalized}`;
};
