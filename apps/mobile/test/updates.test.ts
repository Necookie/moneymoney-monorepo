import { describe, expect, it } from 'vitest';
import { compareVersions, pickUpdate } from '../src/lib/updates/version';

const release = (version: string) => ({
  version,
  publishedAt: '2026-11-07T08:00:00Z',
  notes: '',
  apk: { name: `moneymoney-${version}.apk`, sizeBytes: 1, url: `https://dl/${version}.apk` },
});

describe('app update check', () => {
  it('compares versions numerically', () => {
    expect(compareVersions('1.10.0', '1.9.0')).toBe(1);
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
    expect(compareVersions('1.0.0', '1.0.1')).toBe(-1);
  });

  it('offers only strictly newer releases', () => {
    expect(pickUpdate('1.0.0', release('1.1.0'))?.version).toBe('1.1.0');
    expect(pickUpdate('1.1.0', release('1.1.0'))).toBeNull();
    expect(pickUpdate('1.2.0', release('1.1.0'))).toBeNull();
  });

  it('stays quiet when the installed or latest version is unknown', () => {
    expect(pickUpdate(null, release('1.1.0'))).toBeNull();
    expect(pickUpdate('1.0.0', null)).toBeNull();
  });
});

describe('release versioning', () => {
  it('bumps semver and derives a strictly increasing versionCode', async () => {
    const { bumpVersion, versionCodeFor } = await import('../scripts/release-android.mjs');
    expect(bumpVersion('1.0.0', 'patch')).toBe('1.0.1');
    expect(bumpVersion('1.0.9', 'minor')).toBe('1.1.0');
    expect(bumpVersion('1.4.2', 'major')).toBe('2.0.0');
    expect(bumpVersion('1.0.0', '1.3.0')).toBe('1.3.0');
    expect(versionCodeFor('1.0.0')).toBe(10000);
    expect(versionCodeFor('1.2.3')).toBe(10203);
    expect(versionCodeFor('1.10.0')).toBeGreaterThan(versionCodeFor('1.9.99'));
    expect(() => bumpVersion('1.0.0', 'huge')).toThrow();
  });
});
