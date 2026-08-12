export function joinAssetBase(baseUrl: string, path: string): string {
  const normalizedBase = baseUrl.length === 0
    ? './'
    : baseUrl.endsWith('/')
      ? baseUrl
      : `${baseUrl}/`;
  return `${normalizedBase}${path.replace(/^\/+/, '')}`;
}

/** Resolves a file copied from public/ against the active Vite deployment base. */
export function publicAssetUrl(path: string): string {
  return joinAssetBase(import.meta.env.BASE_URL, path);
}
