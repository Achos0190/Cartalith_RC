#!/usr/bin/env bash
# Headless verification for the Urban Morphology engine (Cartalith Gen1's 4th <script> block,
# v0.95+). Extracts the UM-ENGINE-START/END block (mirrors urban-morphology/tests/run.sh's own
# awk pattern — the markers/tag layout are unchanged by the port), prepends a copy of mulberry32
# extracted from script block 1 (the ported engine intentionally does NOT redefine it, relying on
# Gen1's module scope in the browser — see the UM-ENGINE-START comment in the HTML; standalone here
# it needs its own copy so the extracted module has no unresolved global), node --check, then runs
# the ported assertion suite (tests/um_test_tail.js).
# Usage: tests/run_um.sh [path/to/Cartalith Gen1 vX.XX.html]
set -euo pipefail

cd "$(dirname "$0")/.."
HTML="${1:-$(ls "Cartalith Gen1 v"*.html | sort -V | tail -1)}"
OUT=/tmp/cartalith_um_test
mkdir -p "$OUT"

echo "== target: $HTML"

MULB="$(grep -m1 '^function mulberry32' "$HTML" || true)"
if [ -z "$MULB" ]; then echo "mulberry32 not found in $HTML" >&2; exit 1; fi

awk '/UM-ENGINE-START/{f=1;next}/UM-ENGINE-END/{f=0}f' "$HTML" \
  | sed '/^<script>$/d;/^<\/script>$/d' > "$OUT/engine_body.js"

if [ ! -s "$OUT/engine_body.js" ]; then echo "UM-ENGINE-START/END block not found in $HTML" >&2; exit 1; fi

{
  echo "/* mulberry32: extracted from script block 1 for standalone testing here only — the merged"
  echo "   file itself relies on the browser's module scope instead of redefining it (see the"
  echo "   UM-ENGINE-START comment in the HTML)."
  echo "*/"
  echo "$MULB"
  cat "$OUT/engine_body.js"
} > "$OUT/engine.js"

node --check "$OUT/engine.js"
echo "engine.js: syntax OK ($(wc -l < "$OUT/engine.js") lines)"

UM_ENGINE="$OUT/engine.js" node tests/um_test_tail.js
