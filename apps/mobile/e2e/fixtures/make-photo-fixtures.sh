#!/usr/bin/env bash
# Generates the photo fixtures for recipe-create-photo.flow.yaml (T-BUG-O1).
# They are git-ignored: the noise JPEGs are ~20 MB git can't compress. macOS
# only (sips), like the Maestro runs themselves.
#
# Re-run before every Maestro run (run-suite.sh does): each run gets new
# random bytes, because the simulator's photo library skips a re-import of an
# identical file, and the flow picks "the newest photo".
#
# The picker re-encodes at quality 0.5 (recipe-form.tsx pickPhoto), so the
# sizes that matter are AFTER a q50 re-encode. The script checks them with
# sips (= iOS ImageIO); Android's encoder lands ~40% smaller (measured: 12.4 MB
# on iOS → 7.5 MB on Android), so the bounds leave room for both:
#   oversize-photo.jpg    > 18 MB (iOS), ~12 MB (Android) → the too-big sentence
#   large-photo.jpg       8.5–10 MB (iOS), ~5.7 MB (Android) → uploads
#                         (over the old 5 MB limit that 500'd before W0-D)
#   screenshot-photo.jpg  < 1 MB, 1170x2532 → uploads
set -euo pipefail
cd "$(dirname "$0")"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
MB=$((1024 * 1024))

# $1 name, $2 width, $3 height, $4 noise|flat, $5/$6 q50 size bounds (bytes)
make_photo() {
  python3 - "$2" "$3" "$4" >"$TMP/src.ppm" <<'PY'
import os, sys
w, h, kind = int(sys.argv[1]), int(sys.argv[2]), sys.argv[3]
out = sys.stdout.buffer
out.write(b'P6 %d %d 255\n' % (w, h))
if kind == 'noise':
    out.write(os.urandom(w * h * 3))
else:
    # A flat, screenshot-like image; one random row keeps every run unique.
    out.write(os.urandom(w * 3))
    out.write(bytes([235, 238, 242]) * (w * (h - 1)))
PY
  sips -s format jpeg -s formatOptions 50 "$TMP/src.ppm" --out "$1" >/dev/null
  sips -s format jpeg -s formatOptions 50 "$1" --out "$TMP/q50.jpg" >/dev/null
  local bytes
  bytes=$(stat -f%z "$TMP/q50.jpg")
  if [ "$bytes" -le "$5" ] || [ "$bytes" -ge "$6" ]; then
    echo "$1 re-encodes to $bytes bytes, outside ($5, $6)" >&2
    exit 1
  fi
  echo "$1 ok ($bytes bytes after q50)"
}

make_photo oversize-photo.jpg 6000 6000 noise $((18 * MB)) $((40 * MB))
make_photo large-photo.jpg 4000 4000 noise $((85 * MB / 10)) $((10 * MB))
make_photo screenshot-photo.jpg 1170 2532 flat 0 $((1 * MB))

# Android emulator only: drop the previous run's copies and reset the system
# photo picker's cache. Re-pushed same-named files (or rows deleted under its
# cache) make the picker crash on a duplicate grid key.
ADB="${ANDROID_HOME:-$HOME/Library/Android/sdk}/platform-tools/adb"
if [ -x "$ADB" ] && [ "$("$ADB" get-state 2>/dev/null)" = "device" ] &&
  [ "$("$ADB" shell getprop ro.kernel.qemu 2>/dev/null | tr -d '\r')" = "1" ]; then
  for f in oversize-photo.jpg large-photo.jpg screenshot-photo.jpg; do
    "$ADB" shell content delete --uri content://media/external/images/media \
      --where "\"_display_name='$f'\"" >/dev/null 2>&1 || true
    "$ADB" shell rm -f "/sdcard/Pictures/$f" >/dev/null 2>&1 || true
  done
  "$ADB" shell pm clear com.google.android.photopicker >/dev/null 2>&1 || true
  echo "cleared previous fixtures and the photo picker cache on the emulator"
fi
