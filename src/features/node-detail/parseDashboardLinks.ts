export type DashboardLink = { label: string; url: string };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function labelFromUrl(url: string): string | undefined {
  try {
    const segment = new URL(url).pathname.split('/').filter(Boolean).pop();
    if (segment !== undefined && segment.length > 0) {
      return decodeURIComponent(segment);
    }
  } catch {
    // Relative or malformed URL — skip pathname fallback.
  }
  return undefined;
}

function defaultLabel(index: number, url: string): string {
  return labelFromUrl(url) ?? (index === 0 ? 'Dashboard' : `Dashboard ${index + 1}`);
}

function parseItem(raw: unknown, index: number): DashboardLink | undefined {
  if (!isPlainObject(raw) || typeof raw.url !== 'string' || raw.url.length === 0) {
    return undefined;
  }
  const url = raw.url;
  const explicit = typeof raw.label === 'string' && raw.label.trim().length > 0 ? raw.label.trim() : undefined;
  return { label: explicit ?? defaultLabel(index, url), url };
}

function parseUrlsArray(urls: unknown): DashboardLink[] | undefined {
  if (!Array.isArray(urls)) {
    return undefined;
  }
  const links = urls
    .map((item, index) => parseItem(item, index))
    .filter((link): link is DashboardLink => link !== undefined);
  return links.length > 0 ? links : undefined;
}

/**
 * Normalizes a `/dashboard` response body into one or more labeled links.
 * Supports the new `{ urls: [{ label?, url }] }` shape and the legacy `{ url }`.
 */
export function parseDashboardLinks(res: unknown): DashboardLink[] | undefined {
  if (!isPlainObject(res)) {
    return undefined;
  }
  const fromUrls = parseUrlsArray(res.urls);
  if (fromUrls !== undefined) {
    return fromUrls;
  }
  if (typeof res.url === 'string' && res.url.length > 0) {
    return [{ label: 'Dashboard', url: res.url }];
  }
  return undefined;
}
