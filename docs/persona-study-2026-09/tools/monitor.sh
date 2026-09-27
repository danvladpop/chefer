#!/bin/zsh
# Progress/stall watcher for a running persona study. Use as a Monitor command (one line per event):
#   docs/persona-study-2026-09/tools/monitor.sh <study-dir>
# Emits: a progress line every 15 min, "STALL?" when a running persona adds no screenshot for 25 min,
# and "DOWN" when the mock API or Metro stops answering. Mark a persona finished with: touch <study-dir>/sessions/.done-PXX
cd "${1:?study dir, e.g. docs/persona-study-2026-11}"
typeset -A last; typeset -A since
setopt nullglob
while true; do
  line=""
  for d in screenshots/P*; do
    p=$(basename $d); n=$(ls $d 2>/dev/null | wc -l | tr -d ' ')
    if [ "${last[$p]:-x}" != "$n" ]; then last[$p]=$n; since[$p]=$(date +%s); fi
    idle=$(( $(date +%s) - ${since[$p]} ))
    [ $idle -gt 1500 ] && [ ! -f "sessions/.done-$p" ] && echo "STALL? $p no new screenshots for $((idle/60)) min (at $n)"
    [ ! -f "sessions/.done-$p" ] && line="$line $p=$n"
  done
  curl -s -m 5 http://localhost:3011/health >/dev/null || echo "API :3011 DOWN"
  curl -s -m 5 http://localhost:8081/status >/dev/null || echo "Metro :8081 DOWN"
  [ $(( $(date +%s) / 60 % 15 )) -eq 0 ] && echo "progress:$line"
  sleep 60
done
