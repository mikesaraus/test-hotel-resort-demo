#!/bin/bash
# Double-click to open the demo from a local web address (http://localhost:8642).
# Opened that way, the guest booking site and the back office share the same data in every browser,
# including Safari, which keeps a separate copy per file when the pages are opened as files.
# Close this Terminal window to stop it.
cd "$(dirname "$0")" || exit 1
PORT=8642
if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is needed to run the demo. macOS offers to install it the first time you type python3 in Terminal."; read -r -p "Press Return to close." _; exit 1
fi
if ! curl -s -o /dev/null "http://localhost:$PORT/index.html"; then
  python3 -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1 &
  SERVER=$!
  trap 'kill $SERVER 2>/dev/null' EXIT
  for _ in 1 2 3 4 5 6 7 8 9 10; do curl -s -o /dev/null "http://localhost:$PORT/index.html" && break; sleep 0.3; done
fi
open "http://localhost:$PORT/index.html"
echo "Camsair demo: http://localhost:$PORT/index.html"
echo "Guest booking site: http://localhost:$PORT/book.html"
echo "Leave this window open while you test. Close it to stop the demo."
[ -n "$SERVER" ] && wait "$SERVER"
