/**
 * Android release catalogue, backed by GitHub Releases on the Money Money repository.
 *
 * Convention (written by `pnpm --filter @mm/mobile release:android`):
 * - tag `android-v<semver>` (e.g. `android-v1.2.0`)
 * - exactly one `.apk` asset
 * - release body may contain a line `SHA-256: <hex>` for the APK
 */

export const RELEASES_REPO = 'necookie/moneymoney-monorepo';
const TAG_PREFIX = 'android-v';
const CACHE_SECONDS = 300;

export interface AndroidRelease {
  version: string;
  tag: string;
  publishedAt: string;
  notes: string;
  apk: { name: string; sizeBytes: number; url: string };
  sha256: string | null;
  pageUrl: string;
}

export interface AndroidReleaseCatalog {
  latest: AndroidRelease | null;
  releases: AndroidRelease[];
  fetchedAt: string;
}

export interface GitHubAsset {
  name: string;
  size: number;
  browser_download_url: string;
  state?: string;
}
export interface GitHubRelease {
  tag_name: string;
  draft: boolean;
  prerelease: boolean;
  published_at: string | null;
  body: string | null;
  html_url: string;
  assets: GitHubAsset[];
}

/** Compare dotted numeric versions ("1.10.0" > "1.9.3"). */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

/** Pure mapping from the GitHub API payload to our catalogue (unit-tested). */
export function toCatalog(payload: GitHubRelease[], now = new Date()): AndroidReleaseCatalog {
  const releases: AndroidRelease[] = [];
  for (const r of payload) {
    if (r.draft || r.prerelease || !r.tag_name.startsWith(TAG_PREFIX) || !r.published_at) continue;
    const version = r.tag_name.slice(TAG_PREFIX.length);
    if (!/^\d+\.\d+\.\d+$/.test(version)) continue;
    const apk = r.assets.find(
      (a) => a.name.toLowerCase().endsWith('.apk') && a.state !== 'starter',
    );
    if (!apk) continue;
    const body = r.body ?? '';
    const sha = /SHA-256:\s*`?([a-f0-9]{64})`?/i.exec(body)?.[1]?.toLowerCase() ?? null;
    releases.push({
      version,
      tag: r.tag_name,
      publishedAt: r.published_at,
      notes: body.replace(/^\s*SHA-256:.*$/gim, '').trim(),
      apk: { name: apk.name, sizeBytes: apk.size, url: apk.browser_download_url },
      sha256: sha,
      pageUrl: r.html_url,
    });
  }
  releases.sort((a, b) => compareVersions(b.version, a.version));
  return {
    latest: releases[0] ?? null,
    releases: releases.slice(0, 10),
    fetchedAt: now.toISOString(),
  };
}

const decodeEntities = (s: string) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');

/**
 * Parse the public releases Atom feed into GitHub-API-shaped releases. The feed has no asset list,
 * so the APK URL follows the release script's naming convention (`moneymoney-<version>.apk`).
 */
export function parseReleasesAtom(xml: string, repo = RELEASES_REPO): GitHubRelease[] {
  const out: GitHubRelease[] = [];
  for (const [, entry = ''] of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const href = /<link[^>]+href="([^"]+\/releases\/tag\/([^"]+))"/.exec(entry);
    const tag = href?.[2] ? decodeURIComponent(href[2]) : null;
    const updated = /<updated>([^<]+)<\/updated>/.exec(entry)?.[1] ?? null;
    if (!tag || !updated) continue;
    const html = decodeEntities(/<content[^>]*>([\s\S]*?)<\/content>/.exec(entry)?.[1] ?? '');
    const body = decodeEntities(
      html
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n\n')
        .replace(/<[^>]+>/g, ''),
    ).trim();
    const version = tag.startsWith(TAG_PREFIX) ? tag.slice(TAG_PREFIX.length) : tag;
    out.push({
      tag_name: tag,
      draft: false,
      prerelease: false,
      published_at: updated,
      body,
      html_url: href![1]!,
      assets: [
        {
          name: `moneymoney-${version}.apk`,
          size: 0,
          browser_download_url: `https://github.com/${repo}/releases/download/${tag}/moneymoney-${version}.apk`,
        },
      ],
    });
  }
  return out;
}

async function fromApi(): Promise<AndroidReleaseCatalog> {
  const token = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    ?.env?.GITHUB_RELEASES_TOKEN;
  const res = await fetch(`https://api.github.com/repos/${RELEASES_REPO}/releases?per_page=50`, {
    headers: {
      accept: 'application/vnd.github+json',
      'user-agent': 'moneymoney-web',
      'x-github-api-version': '2022-11-28',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status}`);
  return toCatalog((await res.json()) as GitHubRelease[]);
}

async function fromAtom(): Promise<AndroidReleaseCatalog> {
  const res = await fetch(`https://github.com/${RELEASES_REPO}/releases.atom`, {
    headers: { accept: 'application/atom+xml', 'user-agent': 'moneymoney-web' },
  });
  if (!res.ok) throw new Error(`GitHub releases feed ${res.status}`);
  const catalog = toCatalog(parseReleasesAtom(await res.text()));
  // The feed has no sizes; look up the newest APK's size (best effort).
  if (catalog.latest) {
    const head = await fetch(catalog.latest.apk.url, { method: 'HEAD', redirect: 'follow' }).catch(
      () => null,
    );
    const size = Number(head?.headers.get('content-length') ?? 0);
    if (head?.ok && size > 0) catalog.latest.apk.sizeBytes = size;
  }
  return catalog;
}

/**
 * Release catalogue, cached at the edge for 5 minutes (Workers Cache API). Tries the GitHub REST
 * API first (optionally authenticated via GITHUB_RELEASES_TOKEN); Cloudflare's shared egress IPs
 * often exhaust the unauthenticated API limit, so it falls back to the public releases Atom feed.
 */
export async function fetchAndroidCatalog(): Promise<AndroidReleaseCatalog> {
  const cache = (globalThis as { caches?: { default?: Cache } }).caches?.default;
  const cacheKey = new Request('https://moneymoney.necookie.dev/__cache/android-catalog-v2');
  const hit = cache ? await cache.match(cacheKey) : undefined;
  if (hit) return (await hit.json()) as AndroidReleaseCatalog;

  let catalog: AndroidReleaseCatalog;
  try {
    catalog = await fromApi();
  } catch {
    catalog = await fromAtom();
  }
  if (cache) {
    await cache.put(
      cacheKey,
      new Response(JSON.stringify(catalog), {
        headers: {
          'content-type': 'application/json',
          'cache-control': `public, max-age=${CACHE_SECONDS}`,
        },
      }),
    );
  }
  return catalog;
}
