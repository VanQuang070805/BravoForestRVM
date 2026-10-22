#!/usr/bin/env sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
config_dir="${XDG_CONFIG_HOME:-$HOME/.config}/labwc"
autostart="$config_dir/autostart"
marker='# BEGIN BravoForest RVM kiosk autostart'

mkdir -p "$config_dir" "$HOME/.cache"
if [ -f "$autostart" ] && grep -Fqx "$marker" "$autostart"; then
  echo "Kiosk autostart da duoc cai dat."
  exit 0
fi

printf '\n' >> "$autostart"
cat >> "$autostart" <<EOF
$marker
(
  until curl -fsS http://127.0.0.1:3002/ >/dev/null 2>&1; do sleep 2; done
  /bin/sh "$script_dir/launch-display.sh"
) >> "$HOME/.cache/bravoforest-rvm-kiosk.log" 2>&1 &
# END BravoForest RVM kiosk autostart
EOF

echo "Da bat tu dong mo kiosk toan man hinh moi khi Labwc dang nhap."
