#!/usr/bin/env node
/**
 * Publish a Money Money Android release.
 *
 *   pnpm --filter @mm/mobile release:android -- --bump patch            # 1.0.0 → 1.0.1, EAS build, publish
 *   pnpm --filter @mm/mobile release:android -- --bump minor --notes "Budgets on Home"
 *   pnpm --filter @mm/mobile release:android -- --apk ./my-build.apk   # publish an APK you built yourself
 *   pnpm --filter @mm/mobile release:android -- --bump patch --local       # build on this PC (Android SDK)
 *   pnpm --filter @mm/mobile release:android -- --bump patch --dry-run
 *
 * Steps: bump `expo.version` + `android.versionCode` in app.json (versionCode = major·10000 +
 * minor·100 + patch, so it always increases with the version) → commit + push → build the APK
 * with EAS (`preview` profile) unless --apk is given → SHA-256 → GitHub Release `android-v<version>`
 * with the APK attached. The web app's "Install Android app" card and the in-app update check read
 * these releases automatically.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = 'necookie/moneymoney-monorepo';
const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const appJsonPath = join(appDir, 'app.json');
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? (args[i + 1] ?? '') : undefined;
};
const dryRun = args.includes('--dry-run');
const local = args.includes('--local');
const repoRoot = resolve(appDir, '..', '..');

function readSecrets() {
  const file = join(repoRoot, '.secrets.local.env');
  const out = {};
  if (!existsSync(file)) return out;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) out[m[1]] = m[2].trim().replace(/^(["'])(.*)\1$/, '$2');
  }
  return out;
}

/**
 * Build a signed release APK on this machine: expo prebuild (CNG) → Gradle assembleRelease for
 * arm64-v8a, signed with the Money Money upload key from .secrets/ (same key EAS uses via
 * credentials.json, so local and cloud builds update each other).
 */
function buildLocal() {
  const sdk = process.env.ANDROID_HOME || join(process.env.LOCALAPPDATA ?? '', 'Android', 'Sdk');
  if (!existsSync(join(sdk, 'licenses', 'android-sdk-license'))) {
    throw new Error(
      `Android SDK licenses not accepted. Run: "${join(sdk, 'cmdline-tools', 'latest', 'bin', 'sdkmanager.bat')}" --licenses`,
    );
  }
  const s = readSecrets();
  const store = join(repoRoot, '.secrets', 'android', 'moneymoney-release.jks');
  if (!existsSync(store) || !s.MM_ANDROID_KEYSTORE_PASSWORD)
    throw new Error('Release keystore missing (.secrets/android)');
  const env = {
    ...process.env,
    ANDROID_HOME: sdk,
    NODE_ENV: 'production',
    EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY:
      s.CLERK_PUBLISHABLE_KEY ?? process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '',
    EXPO_PUBLIC_API_URL: 'https://api.moneymoney.necookie.dev',
    EXPO_PUBLIC_WEB_URL: 'https://moneymoney.necookie.dev',
    ORG_GRADLE_PROJECT_MM_UPLOAD_STORE_FILE: store,
    ORG_GRADLE_PROJECT_MM_UPLOAD_STORE_PASSWORD: s.MM_ANDROID_KEYSTORE_PASSWORD,
    ORG_GRADLE_PROJECT_MM_UPLOAD_KEY_ALIAS: s.MM_ANDROID_KEY_ALIAS || 'moneymoney',
    ORG_GRADLE_PROJECT_MM_UPLOAD_KEY_PASSWORD: s.MM_ANDROID_KEYSTORE_PASSWORD,
    ORG_GRADLE_PROJECT_reactNativeArchitectures: 'arm64-v8a',
  };
  if (!env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY)
    throw new Error('CLERK_PUBLISHABLE_KEY missing in .secrets.local.env');
  log('prebuild (android)…');
  run('npx', ['expo', 'prebuild', '--platform', 'android', '--no-install', '--clean'], {
    env,
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  log('gradle assembleRelease (arm64-v8a)… first build downloads SDK parts and takes a while');
  const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
  execFileSync(gradlew, ['assembleRelease', '--no-daemon', '--console=plain'], {
    cwd: join(appDir, 'android'),
    env,
    stdio: ['ignore', 'inherit', 'inherit'],
    shell: process.platform === 'win32',
  });
  const apk = join(
    appDir,
    'android',
    'app',
    'build',
    'outputs',
    'apk',
    'release',
    'app-release.apk',
  );
  if (!existsSync(apk)) throw new Error('Gradle finished but no app-release.apk was produced');
  return apk;
}
const run = (cmd, cmdArgs, opts = {}) =>
  execFileSync(cmd, cmdArgs, {
    cwd: appDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
    // Only npx is a .cmd shim on Windows; everything else runs without a shell so arguments
    // (e.g. --notes with spaces) are passed verbatim.
    shell: process.platform === 'win32' && cmd === 'npx',
    ...opts,
  }).trim();
const log = (...m) => console.log('•', ...m);

export function bumpVersion(version, bump) {
  if (/^\d+\.\d+\.\d+$/.test(bump)) return bump;
  const [major, minor, patch] = version.split('.').map(Number);
  if (bump === 'major') return `${major + 1}.0.0`;
  if (bump === 'minor') return `${major}.${minor + 1}.0`;
  if (bump === 'patch') return `${major}.${minor}.${patch + 1}`;
  throw new Error(`--bump must be patch, minor, major or x.y.z (got "${bump}")`);
}

export function versionCodeFor(version) {
  const [major, minor, patch] = version.split('.').map(Number);
  if (minor > 99 || patch > 99) throw new Error('minor and patch must be ≤ 99');
  return major * 10_000 + minor * 100 + patch;
}

async function main() {
  const appJson = JSON.parse(readFileSync(appJsonPath, 'utf8'));
  const current = appJson.expo.version;
  const bump = flag('bump');
  const version = bump ? bumpVersion(current, bump) : current;
  const versionCode = versionCodeFor(version);
  const tag = `android-v${version}`;
  log(`release ${tag} (versionCode ${versionCode})${dryRun ? ' — dry run' : ''}`);

  // Preflight: authenticated gh, clean tree, tag not taken.
  run('gh', ['auth', 'status']);
  if (run('git', ['status', '--porcelain'])) throw new Error('Commit or stash your changes first');
  if (run('git', ['ls-remote', '--tags', 'origin', `refs/tags/${tag}`])) {
    throw new Error(`${tag} already exists — use --bump to publish a new version`);
  }
  if (dryRun) return log('dry run OK');

  if (bump) {
    appJson.expo.version = version;
    appJson.expo.android = { ...appJson.expo.android, versionCode };
    writeFileSync(appJsonPath, `${JSON.stringify(appJson, null, 2)}\n`);
    run('git', ['add', 'app.json']);
    run('git', ['commit', '-m', `chore(mobile): release android v${version}`]);
    run('git', ['push', 'origin', 'HEAD']);
    log('version committed and pushed');
  }
  const commit = run('git', ['rev-parse', 'HEAD']);

  const outDir = join(appDir, 'dist', 'releases');
  mkdirSync(outDir, { recursive: true });
  const apkPath = join(outDir, `moneymoney-${version}.apk`);
  const given = flag('apk');
  if (given) {
    copyFileSync(resolve(given), apkPath);
  } else if (local) {
    copyFileSync(buildLocal(), apkPath);
  } else {
    log('building APK with EAS (preview profile)… this takes several minutes');
    const out = run('npx', [
      'eas-cli@latest',
      'build',
      '--platform',
      'android',
      '--profile',
      'preview',
      '--non-interactive',
      '--wait',
      '--json',
    ]);
    const builds = JSON.parse(out.slice(out.indexOf('[')));
    const url = builds[0]?.artifacts?.buildUrl ?? builds[0]?.artifacts?.applicationArchiveUrl;
    if (!url) throw new Error('EAS build finished without an APK URL');
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Downloading the APK failed (${res.status})`);
    writeFileSync(apkPath, Buffer.from(await res.arrayBuffer()));
  }

  const sha256 = createHash('sha256').update(readFileSync(apkPath)).digest('hex');
  const notes = `${flag('notes') ?? `Money Money ${version} for Android.`}\n\nversionCode ${versionCode} · commit ${commit.slice(0, 7)}\n\nSHA-256: ${sha256}`;
  run('gh', [
    'release',
    'create',
    tag,
    `${apkPath}#moneymoney-${version}.apk`,
    '--repo',
    REPO,
    '--target',
    commit,
    '--title',
    `Money Money Android v${version}`,
    '--notes',
    notes,
    '--latest',
  ]);
  log(`published ${tag}`);
  log('install link: https://moneymoney.necookie.dev/download/android');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('✖', err.message);
    process.exit(1);
  });
}
