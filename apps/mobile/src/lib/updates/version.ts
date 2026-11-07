/** Pure version helpers (unit-tested). */

export interface AndroidReleaseInfo {
  version: string;
  publishedAt: string;
  notes: string;
  apk: { name: string; sizeBytes: number; url: string };
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

/** The newer release, or null when the installed version is current (or unknown). */
export function pickUpdate(
  installed: string | null | undefined,
  latest: AndroidReleaseInfo | null | undefined,
): AndroidReleaseInfo | null {
  if (!installed || !latest) return null;
  return compareVersions(latest.version, installed) > 0 ? latest : null;
}
