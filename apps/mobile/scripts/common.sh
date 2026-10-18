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
# Sentry (M1-6): the release Gradle task and the Xcode bundle phase upload
# source maps / debug symbols, and FAIL the build when that upload can't
# authenticate. No SENTRY_AUTH_TOKEN (in the shell or .env) = skip the upload.
# Env only — never part of the native fingerprint.
if [ -z "${SENTRY_AUTH_TOKEN:-}" ]; then
  export SENTRY_DISABLE_AUTO_UPLOAD=true
fi

PROD_API_URL="https://chefer.duckdns.org"

use_production() {
  export APP_VARIANT=production
  export EXPO_PUBLIC_API_URL="$PROD_API_URL"
  export NODE_ENV=production
}
