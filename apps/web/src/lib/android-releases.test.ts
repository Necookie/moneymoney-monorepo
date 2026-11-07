import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { compareVersions, parseReleasesAtom, toCatalog } from './android-releases.ts';

const SHA = 'a'.repeat(64);
const rel = (tag: string, extra: Record<string, unknown> = {}) => ({
  tag_name: tag,
  draft: false,
  prerelease: false,
  published_at: '2026-11-07T08:00:00Z',
  body: `Fixes and improvements.\n\nSHA-256: ${SHA}`,
  html_url: `https://github.com/x/y/releases/tag/${tag}`,
  assets: [
    {
      name: `moneymoney-${tag}.apk`,
      size: 52_428_800,
      browser_download_url: `https://dl/${tag}.apk`,
    },
  ],
  ...extra,
});

describe('compareVersions', () => {
  it('orders numerically, not lexically', () => {
    assert.equal(compareVersions('1.10.0', '1.9.3'), 1);
    assert.equal(compareVersions('1.2.0', '1.2.0'), 0);
    assert.equal(compareVersions('0.9.9', '1.0.0'), -1);
  });
});

describe('toCatalog', () => {
  it('keeps only published android-v releases with an APK, newest version first', () => {
    const catalog = toCatalog([
      rel('android-v1.2.0'),
      rel('android-v1.10.0'),
      rel('android-v1.3.0', { draft: true }),
      rel('android-v1.4.0', { prerelease: true }),
      rel('web-v2.0.0'),
      rel('android-v1.5.0', { assets: [] }),
      rel('android-vnext'),
    ]);
    assert.deepEqual(
      catalog.releases.map((r) => r.version),
      ['1.10.0', '1.2.0'],
    );
    assert.equal(catalog.latest?.version, '1.10.0');
    assert.equal(catalog.latest?.apk.url, 'https://dl/android-v1.10.0.apk');
  });

  it('extracts the checksum and strips it from the notes', () => {
    const latest = toCatalog([rel('android-v1.0.0')]).latest!;
    assert.equal(latest.sha256, SHA);
    assert.equal(latest.notes, 'Fixes and improvements.');
  });

  it('returns an empty catalogue when nothing is published', () => {
    const catalog = toCatalog([]);
    assert.equal(catalog.latest, null);
    assert.deepEqual(catalog.releases, []);
  });
});

describe('parseReleasesAtom (fallback when the GitHub API is rate limited)', () => {
  const feed = `<?xml version="1.0"?><feed>
  <entry>
    <id>tag:github.com,2008:Repository/1/android-v1.1.0</id>
    <updated>2026-11-08T01:00:00Z</updated>
    <link rel="alternate" type="text/html" href="https://github.com/necookie/moneymoney-monorepo/releases/tag/android-v1.1.0"/>
    <title>Money Money Android v1.1.0</title>
    <content type="html">&lt;p&gt;Faster sync &amp;amp; fixes.&lt;/p&gt;&lt;p&gt;SHA-256: ${SHA}&lt;/p&gt;</content>
  </entry>
  <entry>
    <updated>2026-11-07T01:00:00Z</updated>
    <link rel="alternate" type="text/html" href="https://github.com/necookie/moneymoney-monorepo/releases/tag/web-v9.0.0"/>
    <content type="html"></content>
  </entry>
</feed>`;

  it('derives the APK URL by convention and keeps notes + checksum', () => {
    const catalog = toCatalog(parseReleasesAtom(feed));
    assert.equal(catalog.releases.length, 1);
    assert.equal(catalog.latest?.version, '1.1.0');
    assert.equal(
      catalog.latest?.apk.url,
      'https://github.com/necookie/moneymoney-monorepo/releases/download/android-v1.1.0/moneymoney-1.1.0.apk',
    );
    assert.equal(catalog.latest?.sha256, SHA);
    assert.equal(catalog.latest?.notes, 'Faster sync & fixes.');
  });
});
