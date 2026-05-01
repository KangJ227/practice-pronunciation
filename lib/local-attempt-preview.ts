export const getPreviewUrlToRevoke = (
  previousUrl: string | null,
  nextUrl: string | null,
): string | null => {
  if (!previousUrl) {
    return null;
  }

  return previousUrl === nextUrl ? null : previousUrl;
};
