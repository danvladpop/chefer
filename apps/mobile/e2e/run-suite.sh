#!/usr/bin/env bash
# Runs each Maestro flow in its OWN maestro invocation (fresh driver session).
# The iOS xctest driver (Xcode 26.3 + maestro 2.9) can wedge on long
# multi-flow sessions; per-flow sessions are stable on both platforms.
# Usage: ./e2e/run-suite.sh <device-id>
set -u
DEVICE="${1:?usage: run-suite.sh <device-id>}"
MAESTRO="${MAESTRO_BIN:-$HOME/.maestro/bin/maestro}"
pass=0; fail=0; failed=()
for flow in "$(dirname "$0")"/*.flow.yaml; do
  name=$(basename "$flow")
  if "$MAESTRO" --device "$DEVICE" test "$flow" >/dev/null 2>&1; then
    echo "PASS  $name"; pass=$((pass+1))
  else
    echo "FAIL  $name"; fail=$((fail+1)); failed+=("$name")
  fi
done
echo "$pass passed, $fail failed${failed:+: ${failed[*]}}"
[ "$fail" -eq 0 ]
