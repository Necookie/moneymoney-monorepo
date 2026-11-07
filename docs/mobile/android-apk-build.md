# Building the Android app (APK / AAB)

The mobile app is `apps/mobile` (Expo SDK 58, React Native 0.88, Expo Router, NativeWind 4).
Builds run on **EAS Build** — no local Android SDK is needed. `android/` and `ios/` are generated
at build time (Continuous Native Generation) and are git-ignored; configure native behaviour only
through `app.json` and config plugins.

App identity: name **Money Money**, Android package / iOS bundle id `dev.necookie.moneymoney`,
URL scheme `moneymoney`. iOS config is present but iOS builds are not set up yet.

## One-time setup

```bash
npx eas-cli@latest login
cd apps/mobile
npx eas-cli@latest init            # links the project; writes extra.eas.projectId into app.json
```

Set the environment variables on EAS (they are inlined into the JS bundle at build time; both are
public values — never put secrets in `EXPO_PUBLIC_*`):

```bash
npx eas-cli@latest env:create --name EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY --value pk_live_xxx \
  --environment production --environment preview --environment development --visibility plaintext
# Optional (defaults to https://api.moneymoney.necookie.dev, also set in eas.json):
npx eas-cli@latest env:create --name EXPO_PUBLIC_API_URL --value https://api.moneymoney.necookie.dev \
  --environment production --environment preview --environment development --visibility plaintext
```

For local development copy `apps/mobile/.env.example` to `apps/mobile/.env`.

In the Clerk dashboard, make sure **email + password** sign-in is enabled for the instance used by
the publishable key. The API only accepts the owner's Clerk user (`OWNER_CLERK_USER_IDS`); any
other account signs in but gets the "This Money Money instance is private" screen (HTTP 403).

## Profiles (`apps/mobile/eas.json`)

| Profile | Output | Use |
|---|---|---|
| `development` | debug **APK** with `expo-dev-client` | install on a device, then `npx expo start` to load JS |
| `preview` | release **APK**, internal distribution | sideload / share an install link |
| `production` | **AAB** (app bundle), auto-incremented versionCode | Google Play |

```bash
cd apps/mobile
npx eas-cli@latest build -p android --profile preview      # installable APK
npx eas-cli@latest build -p android --profile production   # Play Store AAB
npx eas-cli@latest build -p android --profile development  # dev client
```

EAS generates and stores the Android keystore on the first build (choose "Generate new keystore").
Never commit `*.jks`/`*.keystore` (they are git-ignored).

## Monorepo notes

- pnpm workspace with `nodeLinker: hoisted` (most reliable layout for React Native native builds).
  EAS installs from the repo root using the pnpm version pinned in `eas.json` (12.18.0) and Node
  22.12.0.
- Workspace packages (`@mm/api-client`, `@mm/finance-engine`, `@mm/types`, `@mm/validation`,
  `@mm/design-tokens`) publish `dist/`, which is git-ignored. The `eas-build-post-install` script in
  `apps/mobile/package.json` runs `pnpm --filter "@mm/mobile^..." build`, i.e. builds every
  workspace dependency of the app (but not the app itself) right after EAS installs dependencies.
  Locally, run `pnpm build` (or `pnpm --filter "@mm/mobile^..." build`) once before `expo start`.
- Expo's Metro config has built-in monorepo support; `metro.config.js` only adds NativeWind.

## Verifying without a device

```bash
cd apps/mobile
npx tsc --noEmit
pnpm lint
pnpm test                                   # vitest: sync engine & outbox
npx expo-doctor
npx expo export --platform android          # proves the JS bundle builds
```

## Brand assets

`assets/` holds the generated icon, adaptive-icon layers, monochrome icon, splash mark and the
white notification icon. Regenerate with `node apps/mobile/scripts/generate-brand-assets.mjs`
(pure Node, no dependencies).

## Runtime notes

- **Notifications** are local only (expo-notifications): bill reminders at 09:00 Asia/Manila the
  day before each planned outflow, and one notification per new critical alert. Remote push is **not
  enabled** (no push tokens are registered and the API has no push sender).
- **Background sync** uses `expo-background-task` (WorkManager, ≥ 30 min, OS-scheduled).
- **App lock** (Settings) uses `expo-local-authentication` with device-credential fallback; it
  re-locks after 60 s in the background and is unavailable on devices with no screen lock.
- `android.allowBackup` is `false` so the financial database is not copied into cloud backups.

## Releases & version control

Every Android build that users install is a **GitHub Release** on this repository:

| Item | Convention |
|---|---|
| Tag | `android-v<semver>` (e.g. `android-v1.2.0`), created on the exact commit that was built |
| Asset | `moneymoney-<version>.apk` (one per release) |
| `expo.version` (app.json) | The user-visible version (semver) |
| `android.versionCode` | Derived: `major·10000 + minor·100 + patch` — always increases with the version, so Android accepts updates installed over the existing app (`eas.json` uses `appVersionSource: "local"`) |
| Release notes | Your notes + versionCode + commit + `SHA-256: <hex>` of the APK |

### Publish a new version

```bash
pnpm --filter @mm/mobile release:android -- --bump patch --notes "Faster sync"   # 1.0.0 → 1.0.1
pnpm --filter @mm/mobile release:android -- --bump minor                         # → 1.1.0
pnpm --filter @mm/mobile release:android -- --apk path/to/app.apk                # publish a locally built APK
pnpm --filter @mm/mobile release:android -- --bump patch --dry-run              # preflight only
```

The script checks `gh` auth, a clean git tree and that the tag is free; bumps and commits
`app.json`; builds with EAS (`preview` profile) unless `--apk` is given; computes the SHA-256; and
creates the GitHub Release. Requires `eas login` for EAS builds and `gh auth login`.

### Where it shows up

- **Web:** Settings → *Android app* (sidebar: *Install Android app*) shows the latest version,
  size, notes, checksum, a QR code and previous versions. `https://moneymoney.necookie.dev/download/android`
  always redirects to the newest APK; `/api/android/releases` returns the catalogue as JSON
  (both public, cached 5 min).
- **App:** Home shows an "update available" banner and Settings → *App version* has
  *Check for updates* / *Download*. Updates install over the existing app and keep sign-in and data.

### Rolling back

Download an older APK from *Previous versions*. Android refuses to install a lower versionCode
over a higher one, so uninstall first — sync any pending offline entries before uninstalling (the
server holds everything else). Prefer shipping a new patch version that reverts the change.
