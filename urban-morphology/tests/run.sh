#!/usr/bin/env bash
# Headless verification for the Urban Morphology PoC.
# Extracts the engine <script> block (UM-ENGINE-START/END markers), syntax-checks it,
# then runs the assertion suite in Node. Mirrors the discipline of the Cartalith harness
# but is fully isolated from it.
set -euo pipefail
cd "$(dirname "$0")/.."
TARGET="${1:-Urban Morphology v0.1.html}"
OUT="$(mktemp -d)"
trap 'rm -rf "$OUT"' EXIT

awk '/UM-ENGINE-START/{f=1;next}/UM-ENGINE-END/{f=0}f' "$TARGET" \
  | sed '/^<script>$/d;/^<\/script>$/d' > "$OUT/engine.js"

node --check "$OUT/engine.js"
echo "engine.js: syntax OK ($(wc -l < "$OUT/engine.js") lines)"

UM_ENGINE="$OUT/engine.js" node tests/test_tail.js
