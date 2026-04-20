#!/usr/bin/env bash
# Pro-Prompt M0 spike — dumps every hook's stdin payload for analysis.
# Installs 6 hook events that write JSON to /tmp/pro-prompt-spike/.
set -euo pipefail

DIR=/tmp/pro-prompt-spike
mkdir -p "$DIR"
TS=$(date +%s%N)
EVT="${1:-unknown}"
FILE="$DIR/${EVT}-${TS}.json"

# Read stdin (payload) + env to a single JSON-ish file for later inspection.
{
  echo "=== ENV ==="
  env | grep -iE '^(CLAUDE|PRO_PROMPT)' || true
  echo "=== STDIN ==="
  cat
} > "$FILE"

# Always succeed — fail-open principle.
exit 0
