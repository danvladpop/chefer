#!/usr/bin/env bash
# Builds the standalone production APK (prod API, EAS Update channel
# "production") and installs it over USB. No Metro, no laptop at runtime.
#   ANDROID_SERIAL  adb serial (default: the Pixel 8 Pro)
#   NO_INSTALL=1    build only
#
# Signing (since 2026-10-06 — earlier APKs were signed with the PUBLIC debug key):
#   CHEFER_ANDROID_KEYSTORE           release keystore (default ~/.chefer-release/chefer-release.jks)
#   CHEFER_ANDROID_KEY_ALIAS          key alias (default chefer)
#   CHEFER_ANDROID_KEYSTORE_PASSWORD  keystore password; asked for (hidden) when unset
#   CHEFER_ANDROID_KEY_PASSWORD       key password (default: the keystore password)
# The key's SHA-256 must match ANDROID_CERT_SHA256 on the server (assetlinks.json) and its
# SHA-1 the Google Cloud Android OAuth client. Never commit the keystore or its password.
. "$(dirname "$0")/common.sh"
use_production
SERIAL="${ANDROID_SERIAL:-39130DLJG000KU}"

KEYSTORE="${CHEFER_ANDROID_KEYSTORE:-$HOME/.chefer-release/chefer-release.jks}"
KEY_ALIAS="${CHEFER_ANDROID_KEY_ALIAS:-chefer}"
if [ ! -f "$KEYSTORE" ]; then
  echo "✖ release keystore not found: $KEYSTORE (set CHEFER_ANDROID_KEYSTORE)" >&2
  exit 1
fi
if [ -z "${CHEFER_ANDROID_KEYSTORE_PASSWORD:-}" ]; then
  read -r -s -p "Keystore password for $KEYSTORE: " CHEFER_ANDROID_KEYSTORE_PASSWORD
  echo
fi
KEY_PASSWORD="${CHEFER_ANDROID_KEY_PASSWORD:-$CHEFER_ANDROID_KEYSTORE_PASSWORD}"

./scripts/ensure-variant.sh android production --clean
# arm64 only: every target phone is arm64, and it quarters the native build.
# Release adds KSP + lint-vital, which overflow the template's 512m metaspace;
# android/ is regenerated each run, so raise it here, not in gradle.properties.
# Sign with the release key through AGP's injected signing properties (what Android
# Studio's "Generate Signed APK" uses), so the regenerated build.gradle stays as Expo
# writes it. Passed as ORG_GRADLE_PROJECT_* env vars, not -P flags, so the passwords
# never show up in the process list.
(cd android && env \
  "ORG_GRADLE_PROJECT_android.injected.signing.store.file=$KEYSTORE" \
  "ORG_GRADLE_PROJECT_android.injected.signing.store.password=$CHEFER_ANDROID_KEYSTORE_PASSWORD" \
  "ORG_GRADLE_PROJECT_android.injected.signing.key.alias=$KEY_ALIAS" \
  "ORG_GRADLE_PROJECT_android.injected.signing.key.password=$KEY_PASSWORD" \
  ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a \
  "-Dorg.gradle.jvmargs=-Xmx4g -XX:MaxMetaspaceSize=1g")
# Copy out of android/ — the next dev-variant prebuild wipes it.
mkdir -p release-builds
APK="release-builds/chefer-production.apk"
cp android/app/build/outputs/apk/release/app-release.apk "$APK"
unzip -p "$APK" assets/fingerprint > release-builds/runtime-android.txt
# Refuse an APK that is not signed with the release key (e.g. the public debug key).
APKSIGNER="$(ls -d "${ANDROID_HOME:-$HOME/Library/Android/sdk}"/build-tools/*/apksigner 2>/dev/null | tail -1)"
if [ -n "$APKSIGNER" ]; then
  SIGNER="$("$APKSIGNER" verify --print-certs "$APK" | sed -n 's/.*certificate SHA-256 digest: //p' | head -1)"
  EXPECTED="$(keytool -list -v -keystore "$KEYSTORE" -alias "$KEY_ALIAS" -storepass "$CHEFER_ANDROID_KEYSTORE_PASSWORD" 2>/dev/null \
    | sed -n 's/.*SHA256: //p' | tr -d ':' | tr '[:upper:]' '[:lower:]')"
  if [ -z "$SIGNER" ] || [ "$SIGNER" != "$EXPECTED" ]; then
    echo "✖ $APK is not signed with $KEYSTORE (got ${SIGNER:-nothing})" >&2
    exit 1
  fi
  echo "› signed with the release key (SHA-256 $SIGNER)"
else
  echo "⚠ apksigner not found — could not verify the release signature" >&2
fi
echo "› built $APK (runtime $(cat release-builds/runtime-android.txt))"

if [ -z "${NO_INSTALL:-}" ]; then
  if ! adb -s "$SERIAL" install -r "$APK"; then
    echo "✖ install failed. If it says INSTALL_FAILED_UPDATE_INCOMPATIBLE, the phone has an APK signed with" >&2
    echo "  the old debug key: uninstall Chefer on the phone once (this clears its local data), then run again." >&2
    exit 1
  fi
  echo "› installed on $SERIAL"
fi
