#!/bin/sh
# usage: check.sh <folder with *.dc.html boards>
# Renders every board headlessly (Playwright from the repo's node_modules) and prints
# CLIPPED (content taller than the board) or SLACK (>60px empty) lines.
HERE=$(cd "$(dirname "$0")" && pwd)
OUT=$(mktemp -d)
node "$HERE/measure.cjs" "$1" "$OUT" && python3 -c "
import json
rows=json.load(open('$OUT/measure.json'))
for r in rows:
  need=max(r['N'],r['maxBottom'])
  if need>r['H']+1: print('CLIPPED',r['f'],'H',r['H'],'needs',need)
  elif r['N']<r['H']-60 and r['H']>844: print('SLACK',r['f'],'H',r['H'],'content',r['N'])
print('checked',len(rows),'boards')
"
