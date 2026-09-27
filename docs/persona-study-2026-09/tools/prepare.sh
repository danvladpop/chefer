#!/usr/bin/env bash
# Persona-study environment preflight + device prep. Idempotent; run from the repo root.
#
#   docs/persona-study-2026-09/tools/prepare.sh [--cache-builds] [lanes...]
#
#   (no args)        check servers + caches, boot and prepare lanes L1 L3 L4 (3 concurrent is the safe maximum)
#   L1 L2 ...        prepare only these lanes
#   --cache-builds   (re)copy the dev-client builds from devices where they're installed into the cache
#
# Servers are NOT started here: start them with the Browser preview tool (launch.json configs
# "api-mock" on :3011 with mock AI, and "metro-study" on :8081 pointing the app at :3011).
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
CACHE="${CHEFER_STUDY_CACHE:-$HOME/Library/Caches/chefer-persona-study}"
ADB="$HOME/Library/Android/sdk/platform-tools/adb"
EMU="$HOME/Library/Android/sdk/emulator/emulator"
APP_ID="dev.chefer.app.dev"
L1="${L1_UDID:-DA773E13-A782-40DD-9D29-DCB6C691C4AD}"
L2="${L2_UDID:-EB28B7D0-81FE-424D-B313-82431B43630B}"
L3="${L3_UDID:-60AA9E80-DD79-4C3A-9272-836A809E954D}"
AVD="${L4_AVD:-Pixel_8}"
mkdir -p "$CACHE"

ok()   { printf '  \033[32mOK\033[0m    %s\n' "$*"; }
warn() { printf '  \033[33mWARN\033[0m  %s\n' "$*"; }
fail() { printf '  \033[31mFAIL\033[0m  %s\n' "$*"; FAILED=1; }
FAILED=0

native_fingerprint() { # cheap proxy for the Expo runtime fingerprint: native-relevant files
  (cd "$ROOT/apps/mobile" && cat package.json app.config.js 2>/dev/null; ls plugins 2>/dev/null) | shasum | cut -c1-12
}

CACHE_BUILDS=0; LANES=()
for a in "$@"; do case "$a" in --cache-builds) CACHE_BUILDS=1 ;; L[1-4]) LANES+=("$a") ;; *) echo "unknown arg $a"; exit 2 ;; esac; done
[ ${#LANES[@]} -eq 0 ] && LANES=(L1 L3 L4)

echo "== Servers"
curl -s -m 5 http://localhost:3011/health | grep -q '"ok"' && ok "mock API :3011" || fail "mock API :3011 down — preview_start {name: \"api-mock\"}"
curl -s -m 5 http://localhost:8081/status | grep -q running && ok "Metro :8081" || fail "Metro :8081 down — preview_start {name: \"metro-study\"}"
docker ps --format '{{.Names}}' | grep -q chefer-postgres && ok "postgres" || fail "chefer-postgres container not running"

echo "== Dev-client builds"
if [ $CACHE_BUILDS -eq 1 ]; then
  for u in "$L1" "$L2" "$L3"; do
    app=$(xcrun simctl get_app_container "$u" "$APP_ID" app 2>/dev/null) || continue
    rm -rf "$CACHE/ChefeDev.app"; cp -R "$app" "$CACHE/ChefeDev.app" && ok "cached iOS app from $u" && break
  done
  apk=$("$ADB" shell pm path "$APP_ID" 2>/dev/null | head -1 | sed 's/package://' | tr -d '\r')
  [ -n "$apk" ] && "$ADB" pull "$apk" "$CACHE/chefer-dev.apk" >/dev/null && ok "cached Android apk"
  native_fingerprint > "$CACHE/native-fingerprint.txt"
fi
[ -d "$CACHE/ChefeDev.app" ] && ok "iOS dev app cached" || fail "no cached iOS dev app — build one: pnpm --filter @chefer/mobile ios, then rerun with --cache-builds"
[ -f "$CACHE/chefer-dev.apk" ] && ok "Android dev apk cached" || warn "no cached Android apk (only needed if the emulator lacks the app)"
if [ -f "$CACHE/native-fingerprint.txt" ] && [ "$(cat "$CACHE/native-fingerprint.txt")" != "$(native_fingerprint)" ]; then
  warn "apps/mobile native config changed since the builds were cached — if the app crashes on launch, rebuild (pnpm --filter @chefer/mobile ios / android) and rerun with --cache-builds"
fi

echo "== Lanes: ${LANES[*]}"
for lane in "${LANES[@]}"; do
  case "$lane" in
    L1|L2|L3)
      eval "u=\$$lane"
      xcrun simctl boot "$u" 2>/dev/null; xcrun simctl bootstatus "$u" -b >/dev/null 2>&1
      xcrun simctl listapps "$u" 2>/dev/null | grep -q "$APP_ID" || xcrun simctl install "$u" "$CACHE/ChefeDev.app"
      xcrun simctl ui "$u" appearance light >/dev/null 2>&1; xcrun simctl ui "$u" content_size large >/dev/null 2>&1
      xcrun simctl listapps "$u" 2>/dev/null | grep -q "$APP_ID" && ok "$lane booted, app installed, light mode, default text size" || fail "$lane: app install failed"
      ;;
    L4)
      if ! "$ADB" devices | grep -q 'emulator-5554[[:space:]]*device'; then
        nohup "$EMU" -avd "$AVD" -no-snapshot-load >/dev/null 2>&1 &
        "$ADB" wait-for-device
        until [ "$("$ADB" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ]; do sleep 3; done
      fi
      "$ADB" shell pm path "$APP_ID" >/dev/null 2>&1 || "$ADB" install -r "$CACHE/chefer-dev.apk" >/dev/null
      "$ADB" reverse tcp:3011 tcp:3011 >/dev/null; "$ADB" reverse tcp:8081 tcp:8081 >/dev/null
      "$ADB" shell cmd uimode night no >/dev/null 2>&1
      "$ADB" shell pm path "$APP_ID" >/dev/null 2>&1 && ok "L4 emulator up, app installed, ports reversed, light mode" || fail "L4: app missing"
      ;;
  esac
done

echo "== Host"
load=$(sysctl -n vm.loadavg | awk '{print $2}'); swap=$(sysctl -n vm.swapusage | awk '{print $6}')
echo "  load $load · swap used $swap  (keep ≤ 3 persona agents at once; above ~30 load the emulator starts freezing)"
[ $FAILED -eq 0 ] && echo "READY — each lane agent starts with: drive.sh <lane> reset" || { echo "NOT READY — fix the FAIL lines above"; exit 1; }
