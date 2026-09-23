#!/usr/bin/env bash
# Builds the production (Release) app, signs it with the free Apple ID team
# from .env and installs it on the iPhone. Free-team certificates expire
# after 7 days — re-running this script is the whole re-sign procedure.
# Phone must be connected (cable or same-network pairing) and UNLOCKED.
#   IOS_DEVICE_UDID  target device (default: the iPhone 17)
#   NO_INSTALL=1     build only (the phone need not be connected)
. "$(dirname "$0")/common.sh"
use_production
UDID="${IOS_DEVICE_UDID:-00008150-001C214622F3401C}"
: "${EXPO_APPLE_TEAM_ID:?set EXPO_APPLE_TEAM_ID in apps/mobile/.env}"

./scripts/ensure-variant.sh ios production --clean
WORKSPACE=$(ls -d ios/*.xcworkspace | head -1)
SCHEME=$(basename "$WORKSPACE" .xcworkspace)
# -allowProvisioning* lets Xcode mint/renew the free provisioning profile —
# `expo run:ios` alone fails with "No profiles found".
DESTINATION="id=$UDID"
[ -n "${NO_INSTALL:-}" ] && DESTINATION="generic/platform=iOS"
xcodebuild -workspace "$WORKSPACE" -scheme "$SCHEME" -configuration Release \
  -destination "$DESTINATION" -derivedDataPath ios/build \
  -allowProvisioningUpdates -allowProvisioningDeviceRegistration build
# Copy out of ios/ — the next dev-variant prebuild wipes it.
mkdir -p release-builds
APP="release-builds/$SCHEME.app"
rm -rf "$APP"
ditto "ios/build/Build/Products/Release-iphoneos/$SCHEME.app" "$APP"
cp "$APP/EXUpdates.bundle/fingerprint" release-builds/runtime-ios.txt
echo "› built $APP (runtime $(cat release-builds/runtime-ios.txt))"
if [ -z "${NO_INSTALL:-}" ]; then
  xcrun devicectl device install app --device "$UDID" "$APP"
  echo "› installed $SCHEME on $UDID — certificate valid for 7 days"
fi
