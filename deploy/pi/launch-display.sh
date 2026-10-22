#!/usr/bin/env sh
set -eu

url="${RVM_DISPLAY_URL:-http://127.0.0.1:3002}"
profile_dir="${XDG_CACHE_HOME:-/tmp}/bravoforest-rvm-kiosk"

# Start the persistent camera preview service when it has been installed.
if command -v systemctl >/dev/null 2>&1; then
  systemctl --user start bravoforest-camera-ai.service >/dev/null 2>&1 || true
fi

if command -v chromium-browser >/dev/null 2>&1; then
  browser=chromium-browser
elif command -v chromium >/dev/null 2>&1; then
  browser=chromium
else
  echo "Khong tim thay Chromium. Hay cai chromium-browser hoac chromium." >&2
  exit 1
fi

exec "$browser" \
  --ozone-platform=wayland \
  --user-data-dir="$profile_dir" \
  --app="$url" \
  --kiosk \
  --start-fullscreen \
  --noerrdialogs \
  --disable-infobars \
  --no-first-run \
  --no-default-browser-check \
  --disable-session-crashed-bubble \
  --disable-translate \
  --disable-extensions
