#!/usr/bin/env sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
env_file="$script_dir/.env"
python_bin="$script_dir/.venv/bin/python"

if [ ! -f "$env_file" ]; then
  cp "$script_dir/.env.example" "$env_file"
fi

if [ ! -x "$python_bin" ]; then
  echo "Chua cai camera AI. Chay: sh deploy/pi/install-controller.sh" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "$env_file"
set +a

camera_only=$(printf '%s' "${CAMERA_ONLY:-false}" | tr '[:upper:]' '[:lower:]')
case "$camera_only" in
  1|true|yes|on) ;;
  *)
    serial_port=${ARDUINO_SERIAL_PORT:-auto}
    if [ "$serial_port" = "auto" ]; then
      if ! "$python_bin" -c 'from serial.tools import list_ports; raise SystemExit(0 if list(list_ports.comports()) else 1)'; then
        echo "Canh bao: chua thay Arduino; chi mo preview CAMERA_ONLY va khong ghi giao dich." >&2
        export CAMERA_ONLY=true
        export AI_ONLY=false
      fi
    elif [ ! -e "$serial_port" ]; then
      echo "Canh bao: khong tim thay Arduino tai $serial_port; chi mo preview CAMERA_ONLY va khong ghi giao dich." >&2
      export CAMERA_ONLY=true
      export AI_ONLY=false
    fi
    ;;
esac

# Thiếu Arduino luôn chuyển sang CAMERA_ONLY để không thể cộng điểm trước khi
# cơ cấu vật lý xác nhận chu trình hoàn tất.
export SHOW_AI_PREVIEW=false
export AI_PREVIEW_MODE=web
cd "$script_dir/../.."
exec "$python_bin" "$script_dir/controller/main.py"
