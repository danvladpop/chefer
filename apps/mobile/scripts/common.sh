# Shared setup for the mobile build scripts — source, don't execute.
# Runs from apps/mobile, with apps/mobile/.env exported so every step
# (prebuild, native build, fingerprint, eas update) sees the same config —
# EXPO_APPLE_TEAM_ID is part of the iOS runtime fingerprint, and a mismatch
# silently stops OTA updates reaching the installed app.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi
# CocoaPods on Ruby 4 crashes without a UTF-8 locale (plan §5 gotcha 10).
export LANG=en_US.UTF-8
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
export PATH="$ANDROID_HOME/platform-tools:$PATH"

PROD_API_URL="https://chefer.duckdns.org"

use_production() {
  export APP_VARIANT=production
  export EXPO_PUBLIC_API_URL="$PROD_API_URL"
  export NODE_ENV=production
}
