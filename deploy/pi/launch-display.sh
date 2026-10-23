#!/usr/bin/env sh
set -eu

url="${RVM_DISPLAY_URL:-http://127.0.0.1:3002}"
profile_dir="${XDG_CACHE_HOME:-/tmp}/bravoforest-rvm-kiosk"

camera_service=bravoforest-camera-ai.service
if ! command -v systemctl >/dev/null 2>&1; then
  echo "Khong tim thay systemd. Cai dich vu camera AI truoc khi mo kiosk." >&2
  exit 1
fi

camera_started_by_kiosk=false
camera_preview_ready() {
  command -v curl >/dev/null 2>&1 \
    && curl -fsS --max-time 1 http://127.0.0.1:8765/health >/dev/null 2>&1
}
camera_controller_running() {
  command -v pgrep >/dev/null 2>&1 \
    && pgrep -f "$script_dir/controller/main.py" >/dev/null 2>&1
}

# Reuse a camera controller started by another Pi workflow. Otherwise, this
# kiosk owns the on-demand service and releases it when its browser closes.
if ! camera_preview_ready \
  && ! systemctl --user is-active --quiet "$camera_service" \
  && ! camera_controller_running; then
  camera_started_by_kiosk=true
  systemctl --user start "$camera_service" >/dev/null 2>&1 || true
fi

stop_camera_ai() {
  if [ "$camera_started_by_kiosk" = true ]; then
    systemctl --user stop "$camera_service" >/dev/null 2>&1 || true
  fi
}
trap stop_camera_ai EXIT

if command -v chromium-browser >/dev/null 2>&1; then
  browser=chromium-browser
elif command -v chromium >/dev/null 2>&1; then
  browser=chromium
else
  echo "Khong tim thay Chromium. Hay cai chromium-browser hoac chromium." >&2
  exit 1
fi

"$browser" \
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
