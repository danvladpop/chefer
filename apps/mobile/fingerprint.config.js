// Runtime fingerprint (runtimeVersion policy "fingerprint", M4-4). The iOS app
// extensions in targets/ (@bacons/apple-targets, C1) compile into the binary,
// but the fingerprint only hashes their expo-target.config.js — so a Swift-only
// change to the widget or the rest Live Activity would keep the same runtime
// and OTA updates would reach binaries without it. Hash the whole folder.
/** @type {import('expo/fingerprint').Config} */
const config = {
  extraSources: [{ type: 'dir', filePath: 'targets', reasons: ['appleTargets'] }],
  // Generated on prebuild from expo-target.config.js (already hashed) and
  // gitignored, so a checkout that has run prebuild must hash the same.
  ignorePaths: ['targets/*/Assets.xcassets/**'],
};

module.exports = config;
