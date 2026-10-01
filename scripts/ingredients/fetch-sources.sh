#!/usr/bin/env bash
# Catalog P3 (docs/plan-ingredient-catalog.md §4.4 step 3): download the raw
# nutrition datasets into scripts/ingredients/out/sources/ (git-ignored).
#
# Re-runnable: every file that already exists is skipped. Delete a file (or the
# whole sources/ dir) to force a re-download. Dataset names, releases, URLs and
# licences are recorded in packages/database/data/ingredients/SOURCES.md — keep
# the two in sync when bumping a release.
#
#   scripts/ingredients/fetch-sources.sh
set -euo pipefail

OUT="$(cd "$(dirname "$0")" && pwd)/out/sources"
mkdir -p "$OUT"

fetch() { # <url> <dest file>
  local url="$1" dest="$OUT/$2"
  if [[ -s "$dest" ]]; then
    echo "skip  $2 (exists)"
    return
  fi
  echo "fetch $2"
  curl -fSL --retry 3 -o "$dest.part" "$url"
  mv "$dest.part" "$dest"
}

unzip_once() { # <zip> <dir>
  local zip="$OUT/$1" dir="$OUT/$2"
  if [[ -d "$dir" ]]; then
    echo "skip  $2/ (unzipped)"
    return
  fi
  mkdir -p "$dir.part"
  unzip -q -o "$zip" -d "$dir.part"
  # The FDC zips wrap the CSVs in one top-level folder; flatten it.
  local inner
  inner="$(find "$dir.part" -name food.csv -print -quit | xargs dirname)"
  mv "$inner" "$dir"
  rm -rf "$dir.part"
}

# ── USDA FoodData Central (CC0 1.0) ─────────────────────────────────────────
FDC=https://fdc.nal.usda.gov/fdc-datasets
fetch "$FDC/FoodData_Central_foundation_food_csv_2026-04-30.zip" fdc-foundation-2026-04-30.zip
fetch "$FDC/FoodData_Central_sr_legacy_food_csv_2018-04.zip" fdc-sr-legacy-2018-04.zip
unzip_once fdc-foundation-2026-04-30.zip fdc-foundation
unzip_once fdc-sr-legacy-2018-04.zip fdc-sr-legacy

# ── ANSES-CIQUAL 2025 (Licence Ouverte / Etalab 2.0) ────────────────────────
# Recherche Data Gouv dataset doi:10.57745/RDMHWY; files by datafile id.
RDG=https://entrepot.recherche.data.gouv.fr/api/access/datafile
mkdir -p "$OUT/ciqual"
fetch "$RDG/666252" ciqual/alim_2025_11_03.xml
fetch "$RDG/666250" ciqual/alim_grp_2025_11_03.xml
fetch "$RDG/666249" ciqual/compo_2025_11_03.xml
fetch "$RDG/666246" ciqual/const_2025_11_03.xml
fetch "$RDG/666248" ciqual/sources_2025_11_03.xml

echo "done → $OUT"
