#!/usr/bin/env bash
#
# Stand-alone dashboard launcher — bypasses the think-prompt CLI plumbing.
#
# When to prefer this over `think-prompt open`:
#   - autostart / launchd is NOT configured yet and you only want to poke around
#   - you only want the dashboard running (no agent, no worker)
#   - CI, smoke-tests, or a quick "does the UI still render" check
#
# When NOT to use this:
#   - production daily use — `think-prompt autostart enable` is the real answer
#   - any time you need hooks / scoring to be live (that needs agent + worker)
#
# Usage:
#   ./scripts/dashboard.sh                 # background + open browser
#   ./scripts/dashboard.sh --foreground    # run in foreground (Ctrl-C to stop)
#   ./scripts/dashboard.sh --no-open       # don't pop a browser tab
#
# Behavior:
#   1. Sanity-check that the dashboard package is built.
#   2. Warn loudly (but don't block) if another process already owns the port.
#   3. Spawn `node packages/dashboard/dist/index.js`.
#   4. Poll the /health endpoint for up to 5 s so the browser doesn't race.
#   5. Open the browser (unless --no-open) on http://127.0.0.1:<port>.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
DASHBOARD_ENTRY="${REPO_ROOT}/packages/dashboard/dist/index.js"
PORT="${THINK_PROMPT_DASHBOARD_PORT:-47824}"
URL="http://127.0.0.1:${PORT}"

FOREGROUND=0
OPEN_BROWSER=1
for arg in "$@"; do
  case "$arg" in
    --foreground|-f) FOREGROUND=1 ;;
    --no-open)       OPEN_BROWSER=0 ;;
    -h|--help)
      grep -E '^#( |$)' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "unknown argument: $arg (try --help)" >&2
      exit 2
      ;;
  esac
done

# --- 1. Sanity checks ------------------------------------------------------
if [[ ! -f "${DASHBOARD_ENTRY}" ]]; then
  echo "✗ dashboard build not found at ${DASHBOARD_ENTRY}" >&2
  echo "  first: pnpm -r build" >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "✗ node is not on PATH" >&2
  exit 1
fi

# --- 2. Port collision warning (not fatal — findFreePort handles it) -------
if lsof -iTCP:"${PORT}" -sTCP:LISTEN -Pn 2>/dev/null | grep -q LISTEN; then
  OWNER=$(lsof -iTCP:"${PORT}" -sTCP:LISTEN -Pn 2>/dev/null | awk 'NR==2 {print $1" (pid "$2")"}')
  echo "⚠ port ${PORT} is already in use by ${OWNER}"
  echo "  dashboard will auto-pick the next free port; check the launch log."
fi

# --- 3. Spawn -------------------------------------------------------------
echo "▸ launching dashboard"
echo "  entry: ${DASHBOARD_ENTRY}"
echo "  url:   ${URL}"

if [[ "${FOREGROUND}" -eq 1 ]]; then
  # Foreground mode — attach to terminal, Ctrl-C stops it. Don't background.
  exec node "${DASHBOARD_ENTRY}"
fi

# Background mode
node "${DASHBOARD_ENTRY}" &
DASHBOARD_PID=$!

# --- 4. Wait for /health to respond ---------------------------------------
READY=0
for _ in $(seq 1 50); do
  if curl -sf --max-time 0.2 "${URL}" >/dev/null 2>&1; then
    READY=1
    break
  fi
  sleep 0.1
done

if [[ "${READY}" -ne 1 ]]; then
  echo "✗ dashboard did not respond at ${URL} within 5 s"
  echo "  check logs:  tail -f ~/.think-prompt/worker.log  (dashboard reuses this logger)"
  echo "  process pid: ${DASHBOARD_PID}"
  exit 1
fi

echo "✓ dashboard up (pid ${DASHBOARD_PID})"

# --- 5. Open browser ------------------------------------------------------
if [[ "${OPEN_BROWSER}" -eq 1 ]]; then
  case "$(uname -s)" in
    Darwin)       open       "${URL}" ;;
    Linux)        xdg-open   "${URL}" >/dev/null 2>&1 || true ;;
    MINGW*|MSYS*) start ""   "${URL}" ;;
    *)            echo "  open manually: ${URL}" ;;
  esac
fi

echo "  stop:  kill ${DASHBOARD_PID}"
