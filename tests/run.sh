#!/usr/bin/env bash
# Headless verification for the Cartalith Gen1 engine (script block 1 of the merged file):
#   1. extract the FIRST <script> body from the HTML (the generator engine)
#   2. node --check (syntax)
#   3. smoke-test suite (stub DOM + CPU-only pipeline)
# Usage: tests/run.sh [path/to/Cartalith Gen1 vX.XX.html]
# Default: the newest "Cartalith Gen1 v*.html" by version sort. NOTE the version-naming convention:
# minor versions are two digits from v0.61 on (v0.61, v0.62, ... v0.70) — sort -V compares the minor
# numerically, so a hypothetical "v0.7" would sort BEFORE "v0.61" and this default would pick the
# wrong file. Keep two digits.
set -euo pipefail

cd "$(dirname "$0")/.."
HTML="${1:-$(ls "Cartalith Gen1 v"*.html | sort -V | tail -1)}"
OUT=/tmp/cartalith_test
mkdir -p "$OUT"

echo "== target: $HTML"
python3 - "$HTML" "$OUT/elev.js" <<'PY'
import re, sys
html = open(sys.argv[1]).read()
js = re.findall(r'<script>(.*?)</script>', html, re.S)[0]
open(sys.argv[2], 'w').write(js)
print(f"extracted {len(js.splitlines())} lines of JS")
PY

node --check "$OUT/elev.js"
echo "== syntax OK"

cat tests/stub_head.js "$OUT/elev.js" tests/test_tail.js > "$OUT/run.js"
timeout 300 node "$OUT/run.js"
