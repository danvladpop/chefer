#!/usr/bin/env bash
# Builds the standalone production APK (prod API, EAS Update channel
# "production") and installs it over USB. No Metro, no laptop at runtime.
#   ANDROID_SERIAL  adb serial (default: the Pixel 8 Pro)
#   NO_INSTALL=1    build only
. "$(dirname "$0")/common.sh"
use_production
SERIAL="${ANDROID_SERIAL:-39130DLJG000KU}"

./scripts/ensure-variant.sh android production --clean
# arm64 only: every target phone is arm64, and it quarters the native build.
# Release adds KSP + lint-vital, which overflow the template's 512m metaspace;
# android/ is regenerated each run, so raise it here, not in gradle.properties.
(cd android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a \
  "-Dorg.gradle.jvmargs=-Xmx4g -XX:MaxMetaspaceSize=1g")
# Copy out of android/ — the next dev-variant prebuild wipes it.
mkdir -p release-builds
APK="release-builds/chefer-production.apk"
cp android/app/build/outputs/apk/release/app-release.apk "$APK"
unzip -p "$APK" assets/fingerprint > release-builds/runtime-android.txt
echo "› built $APK (runtime $(cat release-builds/runtime-android.txt))"

if [ -z "${NO_INSTALL:-}" ]; then
  adb -s "$SERIAL" install -r "$APK"
  echo "› installed on $SERIAL"
fi
