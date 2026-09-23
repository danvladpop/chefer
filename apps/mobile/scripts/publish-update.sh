#!/usr/bin/env bash
# Publishes the current JS to the EAS Update "production" channel. Installed
# production apps download it on their next launch and run it on the launch
# after that. Only binaries whose runtime (native fingerprint) matches get it —
# after adding a native module, rebuild with release-*.sh instead.
# Usage: publish-update.sh "what changed"
. "$(dirname "$0")/common.sh"
use_production
MESSAGE="${1:?usage: publish-update.sh \"message\"}"

# Refuse to publish when the JS targets a runtime (native fingerprint) that no
# binary built on this machine has — the update would reach nobody. Causes:
# new/upgraded native module, app.config.js change, icon change, .gitignore
# edit. Fix: pnpm mobile:release:<platform> first. Override (e.g. publishing
# ahead of a rebuild): ALLOW_RUNTIME_MISMATCH=1.
mismatch=0
for platform in ios android; do
  runtime=$(npx expo-updates runtimeversion:resolve --platform "$platform" 2>/dev/null |
    tail -1 | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).runtimeVersion))')
  built=$(cat "release-builds/runtime-$platform.txt" 2>/dev/null || echo "none")
  if [ "$runtime" = "$built" ]; then
    echo "› $platform runtime $runtime — matches the last release build"
  else
    echo "✖ $platform runtime $runtime ≠ last release build ($built)"
    echo "  installed $platform apps would NOT receive this — run: pnpm mobile:release:$platform"
    mismatch=1
  fi
done
if [ "$mismatch" = 1 ] && [ -z "${ALLOW_RUNTIME_MISMATCH:-}" ]; then
  echo "Aborting (set ALLOW_RUNTIME_MISMATCH=1 to publish anyway)." >&2
  exit 1
fi

# --environment is mandatory with --non-interactive; no EAS-hosted vars are
# defined, so the EXPO_PUBLIC_API_URL exported above is what gets bundled.
npx -y eas-cli@^24 update --channel production --environment production \
  --message "$MESSAGE" --non-interactive
