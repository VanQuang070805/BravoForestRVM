#!/usr/bin/env sh
set -eu

autostart="${XDG_CONFIG_HOME:-$HOME/.config}/labwc/autostart"
if [ ! -f "$autostart" ]; then
  echo "Chua co cau hinh tu dong mo kiosk."
  exit 0
fi

temporary=$(mktemp)
awk '
  /^# BEGIN BravoForest RVM kiosk autostart$/ { skip = 1; next }
  /^# END BravoForest RVM kiosk autostart$/ { skip = 0; next }
  !skip { print }
' "$autostart" > "$temporary"
mv "$temporary" "$autostart"
echo "Da tat tu dong mo kiosk."
