// Expo config plugin: sign local release builds with the Money Money upload key when the Gradle
// properties MM_UPLOAD_STORE_FILE / _STORE_PASSWORD / _KEY_ALIAS / _KEY_PASSWORD are provided
// (the release script passes them with -P; nothing secret is written to the project).
// Without them, release builds fall back to the debug key exactly like the Expo template.
const { withAppBuildGradle } = require('expo/config-plugins');

const SIGNING = `
        release {
            if (project.hasProperty('MM_UPLOAD_STORE_FILE')) {
                storeFile file(project.property('MM_UPLOAD_STORE_FILE'))
                storePassword project.property('MM_UPLOAD_STORE_PASSWORD')
                keyAlias project.property('MM_UPLOAD_KEY_ALIAS')
                keyPassword project.property('MM_UPLOAD_KEY_PASSWORD')
            }
        }`;

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    let gradle = cfg.modResults.contents;
    if (gradle.includes('MM_UPLOAD_STORE_FILE')) return cfg;
    if (
      !/signingConfigs\s*\{/.test(gradle) ||
      !/release\s*\{[\s\S]*?signingConfig signingConfigs\.debug/.test(gradle)
    ) {
      throw new Error('with-release-signing: unexpected app/build.gradle layout');
    }
    gradle = gradle.replace(/signingConfigs\s*\{/, (m) => `${m}${SIGNING}`);
    gradle = gradle.replace(
      /(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig signingConfigs\.debug/,
      "$1signingConfig project.hasProperty('MM_UPLOAD_STORE_FILE') ? signingConfigs.release : signingConfigs.debug",
    );
    cfg.modResults.contents = gradle;
    return cfg;
  });
};
