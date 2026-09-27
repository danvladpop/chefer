#!/usr/bin/env bash
# Persona-study device driver. One lane = one device; never drive another lane's device.
#
#   drive.sh <lane> <command> [args]
#
# Lanes:  L1 = iPhone 16e (390x844 pt)      L2 = iPhone 17 Pro Max (440x956 pt)
#         L3 = iPhone 17 (402x874 pt)       L4 = Pixel 8 emulator (Android, 1080x2400 px)
#
# Commands:
#   shot <file.png>          screenshot (fast, ~1s). ALWAYS look at it (Read the PNG) before acting.
#   tap <x%> <y%>            tap at a position given as % of screen width/height (read off the screenshot)
#   tapText "<regex>"        tap the element whose text/label matches (iOS ~20s, Android ~35s — prefer tap)
#   type "<text>"            type into the focused field (tap the field first)
#   erase [n]                delete n characters (default 50) from the focused field
#   scroll down|up           scroll the main content
#   swipe <x1%> <y1%> <x2%> <y2%>   raw swipe
#   back                     Android back / iOS edge-swipe back
#   hideKeyboard
#   longPress <x%> <y%>
#   ui                       list visible elements "label @ (x%,y%)" (slow: iOS ~13s, Android ~35s)
#   flow <file.yaml>         iOS/Android: run a multi-step Maestro flow (batch steps to save time on iOS)
#   reset                    FRESH INSTALL state: wipe app data + sign-out, relaunch (first-launch experience)
#   relaunch                 cold restart the app, keeping data (use for the "day 2" return)
#   addPhoto <file>          put an image into the device photo library (for Snap-to-log / photo picker)
#
# Notes: iOS taps via Maestro are slow (~15-25s each) — batch several steps into one `flow` where you can.
set -uo pipefail

LANE="${1:?lane}"; CMD="${2:?command}"; shift 2
MAESTRO="${MAESTRO:-$HOME/.maestro/bin/maestro}"
ADB="$HOME/Library/Android/sdk/platform-tools/adb"
APP_ID="dev.chefer.app.dev"
DEV_URL='chefer-dev://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081'
# Dev-client builds cached by prepare.sh (iOS .app + Android .apk). Rebuild them if the native fingerprint changed.
CACHE="${CHEFER_STUDY_CACHE:-$HOME/Library/Caches/chefer-persona-study}"
DEV_APP="${CHEFER_DEV_APP:-$CACHE/ChefeDev.app}"
TMP="${TMPDIR:-/tmp}/persona-drive-$LANE"; mkdir -p "$TMP"
HERE="$(cd "$(dirname "$0")" && pwd)"

# Lane → device. UDIDs are this Mac's simulators; override with L1_UDID etc. on another machine.
case "$LANE" in
  L1) OS=ios; DEV="${L1_UDID:-DA773E13-A782-40DD-9D29-DCB6C691C4AD}" ;;  # iPhone 16e
  L2) OS=ios; DEV="${L2_UDID:-EB28B7D0-81FE-424D-B313-82431B43630B}" ;;  # iPhone 17 Pro Max
  L3) OS=ios; DEV="${L3_UDID:-60AA9E80-DD79-4C3A-9272-836A809E954D}" ;;  # iPhone 17
  L4) OS=android; DEV="${L4_SERIAL:-emulator-5554}"; W=1080; H=2400 ;;  # Pixel_8 AVD
  *) echo "unknown lane $LANE" >&2; exit 2 ;;
esac

pct() { # pct <value%> <total> -> integer pixels
  local v="${1%\%}"; awk -v v="$v" -v t="$2" 'BEGIN{printf "%d", v*t/100}'
}

mflow() { # run a Maestro flow given as yaml body (steps only)
  local f="$TMP/step-$$.yaml"
  printf 'appId: %s\n---\n%s\n' "$APP_ID" "$1" > "$f"
  "$MAESTRO" --device "$DEV" test "$f" > "$TMP/last-maestro.log" 2>&1
  local rc=$?
  if [ $rc -ne 0 ]; then grep -E 'FAILED|Element not found|Exception|Error' "$TMP/last-maestro.log" | head -5 >&2; fi
  return $rc
}

ios_accept_open_dialog() {
  # System "Open in Chefer Dev?" prompt.
  mflow '- extendedWaitUntil:
    visible: "^Open$"
    timeout: 15000
    optional: true
- tapOn:
    text: "^Open$"
    optional: true' >/dev/null 2>&1 || true
}

ios_dismiss_devmenu_intro() {
  # First launch after install only: the Expo dev-menu intro sheet (has "developer menu" text).
  mflow '- extendedWaitUntil:
    visible: ".*developer menu.*"
    timeout: 40000
    optional: true
- tapOn:
    text: "^Continue$"
    optional: true
- extendedWaitUntil:
    visible: "Source code explorer"
    timeout: 5000
    optional: true
- runFlow:
    when:
      visible: "Source code explorer"
    commands:
      - tapOn: "^Close$"' >/dev/null 2>&1 || true
}

case "$CMD" in
  shot)
    out="${1:?file}"; mkdir -p "$(dirname "$out")"
    if [ "$OS" = ios ]; then xcrun simctl io "$DEV" screenshot "$out" >/dev/null 2>&1
    else "$ADB" -s "$DEV" exec-out screencap -p > "$out"; fi
    echo "saved $out" ;;
  tap)
    if [ "$OS" = ios ]; then mflow "- tapOn:
    point: \"${1%\%}%,${2%\%}%\"" && echo ok
    else "$ADB" -s "$DEV" shell input tap "$(pct "$1" $W)" "$(pct "$2" $H)" && echo ok; fi ;;
  longPress)
    if [ "$OS" = ios ]; then mflow "- longPressOn:
    point: \"${1%\%}%,${2%\%}%\"" && echo ok
    else x=$(pct "$1" $W); y=$(pct "$2" $H); "$ADB" -s "$DEV" shell input swipe $x $y $x $y 900 && echo ok; fi ;;
  tapText)
    if [ "$OS" = ios ]; then mflow "- tapOn: \"$1\"" && echo ok
    else
      node "$HERE/ui.mjs" android-find "$1" "$DEV" > "$TMP/find.txt" || { echo "not found: $1" >&2; exit 1; }
      read -r x y < "$TMP/find.txt"; "$ADB" -s "$DEV" shell input tap "$x" "$y" && echo ok
    fi ;;
  type)
    if [ "$OS" = ios ]; then
      esc=$(printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g')
      mflow "- inputText: \"$esc\"" && echo ok
    else
      esc=$(printf '%s' "$1" | sed "s/ /%s/g; s/'/\\\\'/g; s/&/\\\\&/g; s/(/\\\\(/g; s/)/\\\\)/g; s/;/\\\\;/g")
      "$ADB" -s "$DEV" shell input text "$esc" && echo ok
    fi ;;
  erase)
    n="${1:-50}"
    if [ "$OS" = ios ]; then mflow "- eraseText: $n" && echo ok
    else for _ in $(seq 1 "$n"); do printf '67 '; done | xargs "$ADB" -s "$DEV" shell input keyevent && echo ok; fi ;;
  scroll)
    dir="${1:-down}"
    if [ "$OS" = ios ]; then
      if [ "$dir" = down ]; then mflow '- swipe:
    start: "50%,70%"
    end: "50%,30%"' && echo ok
      else mflow '- swipe:
    start: "50%,30%"
    end: "50%,70%"' && echo ok; fi
    else
      if [ "$dir" = down ]; then "$ADB" -s "$DEV" shell input swipe 540 1700 540 700 300 && echo ok
      else "$ADB" -s "$DEV" shell input swipe 540 700 540 1700 300 && echo ok; fi
    fi ;;
  swipe)
    if [ "$OS" = ios ]; then mflow "- swipe:
    start: \"${1%\%}%,${2%\%}%\"
    end: \"${3%\%}%,${4%\%}%\"" && echo ok
    else "$ADB" -s "$DEV" shell input swipe "$(pct "$1" $W)" "$(pct "$2" $H)" "$(pct "$3" $W)" "$(pct "$4" $H)" 300 && echo ok; fi ;;
  back)
    if [ "$OS" = ios ]; then mflow '- swipe:
    start: "2%,50%"
    end: "80%,50%"' && echo ok
    else "$ADB" -s "$DEV" shell input keyevent 4 && echo ok; fi ;;
  hideKeyboard)
    if [ "$OS" = ios ]; then mflow '- hideKeyboard' && echo ok
    else "$ADB" -s "$DEV" shell input keyevent 111 && echo ok; fi ;;
  ui)
    if [ "$OS" = ios ]; then
      "$MAESTRO" --device "$DEV" hierarchy > "$TMP/h.json" 2>/dev/null
      node "$HERE/ui.mjs" ios "$TMP/h.json" "$DEV"
    else node "$HERE/ui.mjs" android-list "" "$DEV"; fi ;;
  flow)
    "$MAESTRO" --device "$DEV" test "${1:?file}" 2>&1 | tail -25 ;;
  reset)
    if [ "$OS" = ios ]; then
      xcrun simctl terminate "$DEV" "$APP_ID" >/dev/null 2>&1
      xcrun simctl uninstall "$DEV" "$APP_ID" >/dev/null 2>&1
      xcrun simctl keychain "$DEV" reset >/dev/null 2>&1
      xcrun simctl install "$DEV" "$DEV_APP"
      xcrun simctl privacy "$DEV" grant photos "$APP_ID" >/dev/null 2>&1 || true
      xcrun simctl openurl "$DEV" "$DEV_URL"; ios_accept_open_dialog; ios_dismiss_devmenu_intro; sleep 3
    else
      "$ADB" -s "$DEV" shell pm clear "$APP_ID" >/dev/null
      "$ADB" -s "$DEV" reverse tcp:3011 tcp:3011 >/dev/null; "$ADB" -s "$DEV" reverse tcp:8081 tcp:8081 >/dev/null
      "$ADB" -s "$DEV" shell am start -a android.intent.action.VIEW -d "$DEV_URL" "$APP_ID" >/dev/null; sleep 30
      # Expo dev-menu intro sheet on first launch: tap its Continue once.
      if node "$HERE/ui.mjs" android-find "developer menu" "$DEV" >/dev/null 2>&1; then
        "$ADB" -s "$DEV" shell input tap 540 2165; sleep 3; "$ADB" -s "$DEV" shell input keyevent 4; sleep 1
      fi
    fi
    echo "reset done — take a screenshot; dismiss any Expo dev-menu sheet (not part of the product)" ;;
  relaunch)
    if [ "$OS" = ios ]; then
      xcrun simctl terminate "$DEV" "$APP_ID" >/dev/null 2>&1; sleep 1
      xcrun simctl openurl "$DEV" "$DEV_URL"; ios_accept_open_dialog; sleep 10
    else
      "$ADB" -s "$DEV" shell am force-stop "$APP_ID"; sleep 1
      "$ADB" -s "$DEV" shell am start -a android.intent.action.VIEW -d "$DEV_URL" "$APP_ID" >/dev/null; sleep 20
    fi
    echo "relaunched" ;;
  addPhoto)
    f="${1:?file}"
    if [ "$OS" = ios ]; then xcrun simctl addmedia "$DEV" "$f" && echo ok
    else base=$(basename "$f"); "$ADB" -s "$DEV" push "$f" "/sdcard/Pictures/$base" >/dev/null && \
      "$ADB" -s "$DEV" shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d "file:///sdcard/Pictures/$base" >/dev/null && echo ok; fi ;;
  *) echo "unknown command $CMD" >&2; exit 2 ;;
esac
