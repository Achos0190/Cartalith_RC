#!/usr/bin/env bash
# Headless verification for the Fractal Geology Painter.
# Extracts the pure engine (between <ENGINE-START>/<ENGINE-END>), syntax-checks
# it, then runs tests/test_tail.js against it. The renderer/UI (canvas/DOM) is
# not exercisable headlessly and needs a manual browser pass.
set -euo pipefail
cd "$(dirname "$0")/.."

TARGET="${1:-$(ls -1 Fractal\ Geology\ Painter\ v*.html | sort -V | tail -1)}"
echo "Target: $TARGET"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
ENGINE="$WORK/engine.js"

node -e '
const fs=require("fs");
const html=fs.readFileSync(process.argv[1],"utf8");
const m=html.match(/<ENGINE-START>([\s\S]*?)<ENGINE-END>/);
if(!m){ console.error("ENGINE markers not found"); process.exit(2); }
// strip the START comment tail on line 1, and the dangling /* of the END marker
let body=m[1].replace(/^[^\n]*\*\//,"").replace(/\s*\/\*\s*$/,"");
fs.writeFileSync(process.argv[2], body);
' "$TARGET" "$ENGINE"

echo "Extracted engine: $(wc -l < "$ENGINE") lines"
node --check "$ENGINE"
echo "Syntax OK"

cat "$ENGINE" tests/test_tail.js > "$WORK/suite.js"
node "$WORK/suite.js"
