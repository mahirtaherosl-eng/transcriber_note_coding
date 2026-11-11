#!/usr/bin/env bash
set -u
cd "$(dirname "$0")" || exit 1

echo
echo " Transcriber - local setup and launch"
echo " ====================================="
echo

pause_exit() {
  echo
  read -r -p "Press Enter to close..." _
  exit "${1:-1}"
}

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js was not found."
  echo "Install Node.js 20.9 or newer from https://nodejs.org/ and run this again."
  pause_exit
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm was not found. Reinstall Node.js from https://nodejs.org/ (it includes npm)."
  pause_exit
fi

NODE_VERSION_MAJOR=$(node -p "process.versions.node.split('.')[0]")
NODE_VERSION_MINOR=$(node -p "process.versions.node.split('.')[1]")
if [ "$((NODE_VERSION_MAJOR * 100 + NODE_VERSION_MINOR))" -lt 2009 ]; then
  echo "Node.js 20.9 or newer is required. Found $(node --version)."
  echo "Download it from https://nodejs.org/"
  pause_exit
fi

if [ ! -d node_modules/next ]; then
  echo "Installing dependencies. This can take a few minutes on the first run..."
  echo
  if ! npm install; then
    echo
    echo "Dependency installation failed. Check your internet connection and try again."
    pause_exit
  fi
  echo
fi

PORT=3000
if command -v lsof >/dev/null 2>&1; then
  while lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; do
    PORT=$((PORT + 1))
    if [ "$PORT" -gt 3099 ]; then
      echo "Could not find a free port between 3000 and 3099."
      echo "Close other apps using those ports and try again."
      pause_exit
    fi
  done
fi

URL="http://127.0.0.1:$PORT"

echo "Starting Transcriber at $URL"
echo "Add your API key in Settings after the page opens."
echo "Press Ctrl+C in this window to stop the server."
echo

if [ "${TRANSCRIBER_NO_BROWSER:-}" != "1" ]; then
  (
    attempts=0
    while [ "$attempts" -lt 90 ]; do
      if curl -fsS "$URL/api/transcriptions" >/dev/null 2>&1; then
        if command -v open >/dev/null 2>&1; then
          open "$URL"
        elif command -v xdg-open >/dev/null 2>&1; then
          xdg-open "$URL" >/dev/null 2>&1
        fi
        break
      fi
      attempts=$((attempts + 1))
      sleep 1
    done
  ) &
fi

npm run dev -- -p "$PORT"
echo
echo "The server has stopped."
pause_exit 0
