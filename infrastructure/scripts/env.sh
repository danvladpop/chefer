#!/usr/bin/env bash
# ─── Production env helper ────────────────────────────────────────────────────
# Edits .env.production on the VM without opening an editor, keeps a backup
# before every change, and never prints secret values.
#
#   ./infrastructure/scripts/env.sh keys              list variable names (no values)
#   ./infrastructure/scripts/env.sh has NAME           exit 0 if NAME is set
#   ./infrastructure/scripts/env.sh set NAME           prompt for the value (hidden input)
#   ./infrastructure/scripts/env.sh set NAME VALUE     set a non-secret value
#   ./infrastructure/scripts/env.sh gen NAME           random 64-hex secret (skips if already set)
#   ./infrastructure/scripts/env.sh unset NAME         remove NAME
#   ./infrastructure/scripts/env.sh apply              redeploy so containers pick up the changes
#
# From the Mac (the -t is needed for the hidden prompt):
#   ssh -t chefer 'cd ~/chefer && ./infrastructure/scripts/env.sh set SMTP_PASS'
set -euo pipefail
cd "$(dirname "$0")/../.."   # repo root
FILE=.env.production
[ -f "$FILE" ] || { echo "ERROR: $FILE not found in $(pwd)" >&2; exit 1; }

cmd="${1:-}"; name="${2:-}"

need_name() {
  [[ "$name" =~ ^[A-Z][A-Z0-9_]*$ ]] || { echo "ERROR: give a variable name like SMTP_PASS" >&2; exit 1; }
}

backup() {
  local b="$FILE.bak.$(date +%Y%m%d-%H%M%S)-$$-$RANDOM"
  cp -p "$FILE" "$b" && chmod 600 "$b"
  # keep the 10 newest backups
  ls -1t "$FILE".bak.* 2>/dev/null | tail -n +11 | xargs -r rm -f
}

# Write NAME=VALUE, replacing an existing line or appending. Values with spaces
# or shell-special characters are double-quoted (docker compose unquotes them).
write_var() {
  local n="$1" v="$2" line tmp
  if [[ "$v" == *'"'* || "$v" == *$'\n'* ]]; then
    echo "ERROR: values containing double quotes or newlines aren't supported" >&2; exit 1
  fi
  if [[ "$v" =~ [[:space:]\<\>\#\$\'\&\;\|] ]]; then line="$n=\"$v\""; else line="$n=$v"; fi
  backup
  tmp="$(mktemp "$FILE.XXXXXX")"
  awk -v n="$n" -v l="$line" 'BEGIN{done=0} $0 ~ "^"n"=" {if(!done){print l; done=1}; next} {print} END{if(!done) print l}' "$FILE" > "$tmp"
  chmod --reference="$FILE" "$tmp" 2>/dev/null || chmod 600 "$tmp"
  mv "$tmp" "$FILE"
  echo "✔ $n set (backup kept). Run: ./infrastructure/scripts/env.sh apply"
}

case "$cmd" in
  keys)
    grep -oE '^[A-Z][A-Z0-9_]*=' "$FILE" | tr -d '=' | sort ;;
  has)
    need_name; grep -qE "^$name=" "$FILE" ;;
  set)
    need_name
    if [ $# -ge 3 ]; then value="$3"
    else
      read -r -s -p "Value for $name (hidden): " value; echo
      [ -n "$value" ] || { echo "ERROR: empty value, nothing changed" >&2; exit 1; }
    fi
    write_var "$name" "$value" ;;
  gen)
    need_name
    if grep -qE "^$name=" "$FILE"; then echo "✔ $name already set, left unchanged"; exit 0; fi
    write_var "$name" "$(openssl rand -hex 32)" ;;
  unset)
    need_name
    grep -qE "^$name=" "$FILE" || { echo "✔ $name was not set"; exit 0; }
    backup
    tmp="$(mktemp "$FILE.XXXXXX")"
    grep -vE "^$name=" "$FILE" > "$tmp" || true
    chmod --reference="$FILE" "$tmp" 2>/dev/null || chmod 600 "$tmp"
    mv "$tmp" "$FILE"
    echo "✔ $name removed (backup kept). Run: ./infrastructure/scripts/env.sh apply" ;;
  apply)
    exec ./infrastructure/scripts/deploy.sh ;;
  *)
    sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'; exit 1 ;;
esac
