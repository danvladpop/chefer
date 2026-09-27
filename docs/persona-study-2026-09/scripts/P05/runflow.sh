#!/usr/bin/env bash
# run a P05 maestro flow on L1 and copy its takeScreenshot outputs into screenshots/P05
cd /Users/danpop/work/git-projects/chefer
name=$(basename "$1" .yaml)
docs/persona-study-2026-09/tools/drive.sh L1 flow "$1" | grep -E "FAILED|COMPLETED" | tail -4
dir=$(ls -1dt ~/.maestro/tests/*/"$name" 2>/dev/null | head -1)
[ -n "$dir" ] && find "$dir" -path '*takeScreenshot*' -name '*.png' -exec cp {} docs/persona-study-2026-09/screenshots/P05/ \; -print | sed 's#.*/##'
