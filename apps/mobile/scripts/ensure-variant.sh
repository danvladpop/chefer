#!/usr/bin/env bash
# Regenerates ios/ or android/ when it was prebuilt for a different app
# variant (or with --clean). Usage: ensure-variant.sh <ios|android> <development|production> [--clean]
. "$(dirname "$0")/common.sh"
PLATFORM="${1:?platform}"
VARIANT="${2:?variant}"
MARKER="$PLATFORM/.chefer-variant"
if [ "${3:-}" = "--clean" ] || [ "$(cat "$MARKER" 2>/dev/null)" != "$VARIANT" ]; then
  echo "› prebuild $PLATFORM for APP_VARIANT=$VARIANT"
  APP_VARIANT="$VARIANT" npx expo prebuild --clean --platform "$PLATFORM"
  echo "$VARIANT" > "$MARKER"
fi
