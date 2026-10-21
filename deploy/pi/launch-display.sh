#!/usr/bin/env sh
set -eu

url="${RVM_DISPLAY_URL:-http://127.0.0.1:3002}"

if command -v chromium-browser >/dev/null 2>&1; then
  browser=chromium-browser
elif command -v chromium >/dev/null 2>&1; then
  browser=chromium
else
  echo "Khong tim thay Chromium. Hay cai chromium-browser hoac chromium." >&2
  exit 1
fi

exec "$browser" --kiosk --noerrdialogs --disable-infobars "$url"
