#!/usr/bin/env bash
# Mobile toolchain preflight — run before any simulator/emulator/E2E work.
# Agents: report missing items to the user instead of attempting installs
# (most fixes need admin rights or GUI steps). See mobile_native_plan.md §1.
set -u

pass=0
fail=0

check() {
  local label="$1" ok="$2" detail="${3:-}"
  if [ "$ok" = "0" ]; then
    printf 'PASS  %-28s %s\n' "$label" "$detail"
    pass=$((pass + 1))
  else
    printf 'FAIL  %-28s %s\n' "$label" "$detail"
    fail=$((fail + 1))
  fi
}

# ── Core JS toolchain ─────────────────────────────────────────────────────────
node_v=$(node -v 2>/dev/null)
case "$node_v" in v2[0-9].*|v[3-9][0-9].*) node_ok=0 ;; *) node_ok=1 ;; esac
check "node >= 20" "$node_ok" "${node_v:-not found}"

pnpm_v=$(pnpm -v 2>/dev/null)
check "pnpm" "$([ -n "$pnpm_v" ]; echo $?)" "${pnpm_v:-not found}"

watchman_v=$(watchman --version 2>/dev/null)
check "watchman" "$([ -n "$watchman_v" ]; echo $?)" "${watchman_v:-brew install watchman}"

# ── iOS ───────────────────────────────────────────────────────────────────────
xcode_path=$(xcode-select -p 2>/dev/null)
case "$xcode_path" in *Xcode.app*) xcode_ok=0 ;; *) xcode_ok=1 ;; esac
check "Xcode active" "$xcode_ok" "${xcode_path:-install Xcode, then: sudo xcode-select -s /Applications/Xcode.app/Contents/Developer}"

sim_count=$(xcrun simctl list devices available 2>/dev/null | grep -c "iPhone")
check "iOS simulators" "$([ "${sim_count:-0}" -gt 0 ]; echo $?)" "${sim_count:-0} iPhone(s) (need: xcodebuild -downloadPlatform iOS)"

# ── Android ───────────────────────────────────────────────────────────────────
android_home="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
check "ANDROID_HOME" "$([ -d "$android_home" ]; echo $?)" "$android_home"

adb_v=$("$android_home/platform-tools/adb" --version 2>/dev/null | head -1)
check "adb" "$([ -n "$adb_v" ]; echo $?)" "${adb_v:-install Android Studio + platform-tools}"

avds=$("$android_home/emulator/emulator" -list-avds 2>/dev/null | grep -v '^INFO' | tr '\n' ' ')
check "Android AVD" "$([ -n "${avds// /}" ]; echo $?)" "${avds:-create one in Android Studio Device Manager}"

java_v=$(java -version 2>&1 | head -1)
case "$java_v" in *"17."*) java_ok=0 ;; *) java_ok=1 ;; esac
check "JDK 17" "$java_ok" "${java_v:-brew install --cask temurin@17}"

# ── E2E ───────────────────────────────────────────────────────────────────────
maestro_bin=$(command -v maestro || echo "$HOME/.maestro/bin/maestro")
maestro_v=$("$maestro_bin" --version 2>/dev/null | tail -1)
check "maestro" "$([ -n "$maestro_v" ]; echo $?)" "${maestro_v:-curl -Ls https://get.maestro.mobile.dev | bash}"

# ── Local backend (needed for contract tests / app dev) ───────────────────────
health=$(curl -s -m 2 http://localhost:3001/health 2>/dev/null)
case "$health" in *'"status":"ok"'*) api_ok=0 ;; *) api_ok=1 ;; esac
check "API @ :3001" "$api_ok" "$([ "$api_ok" = 0 ] && echo up || echo 'not running — start with: pnpm dev (api needs docker postgres)')"

echo
echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
