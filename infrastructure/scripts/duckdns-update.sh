#!/usr/bin/env bash
# Keep the DuckDNS A record pointed at this VM's public IP. Only needed if the
# VM has an ephemeral IP (skip it if you reserved a static public IP on Oracle).
# Add to cron: */5 * * * * /home/ubuntu/chefer/infrastructure/scripts/duckdns-update.sh
set -euo pipefail

cd "$(dirname "$0")/../.."
set -a; source .env.production; set +a

: "${DUCKDNS_SUBDOMAIN:?set DUCKDNS_SUBDOMAIN in .env.production}"
: "${DUCKDNS_TOKEN:?set DUCKDNS_TOKEN in .env.production}"

# Empty ip= lets DuckDNS auto-detect the caller's public IP.
resp="$(curl -fsS "https://www.duckdns.org/update?domains=${DUCKDNS_SUBDOMAIN}&token=${DUCKDNS_TOKEN}&ip=")"
echo "duckdns: $resp"
[ "$resp" = "OK" ]
