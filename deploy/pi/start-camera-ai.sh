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

# If the Arduino is missing, let the configured AI camera keep the session flow
# working and write its verified item decisions through the machine API.
ai_database_configured() {
  [ -n "${MANAGEMENT_API_URL:-}" ] && [ -n "${RVM_API_KEY:-}" ] || return 1
  case "${RVM_MACHINE_ID:-}" in ''|*[!0-9]*) return 1 ;; esac
  case "${PET_RULE_ID:-0}:${CAN_RULE_ID:-0}" in *[!0-9:]*) return 1 ;; esac
  [ "$RVM_MACHINE_ID" -gt 0 ] || return 1
  [ "${PET_RULE_ID:-0}" -gt 0 ] || [ "${CAN_RULE_ID:-0}" -gt 0 ]
}

camera_only=$(printf '%s' "${CAMERA_ONLY:-false}" | tr '[:upper:]' '[:lower:]')
case "$camera_only" in
  1|true|yes|on) ;;
  *)
    serial_port=${ARDUINO_SERIAL_PORT:-auto}
    if [ "$serial_port" = "auto" ]; then
      if ! "$python_bin" -c 'from serial.tools import list_ports; raise SystemExit(0 if list(list_ports.comports()) else 1)'; then
        if ai_database_configured; then
          echo "Canh bao: chua thay Arduino; chuyen sang AI_ONLY. AI camera se ghi ket qua qua API." >&2
          export AI_ONLY=true
        else
          echo "Canh bao: chua thay Arduino va thieu cau hinh API; chi mo preview CAMERA_ONLY, khong ghi giao dich." >&2
          export CAMERA_ONLY=true
        fi
      fi
    elif [ ! -e "$serial_port" ]; then
      if ai_database_configured; then
        echo "Canh bao: khong tim thay Arduino tai $serial_port; chuyen sang AI_ONLY. AI camera se ghi ket qua qua API." >&2
        export AI_ONLY=true
      else
        echo "Canh bao: khong tim thay Arduino va thieu cau hinh API; chi mo preview CAMERA_ONLY, khong ghi giao dich." >&2
        export CAMERA_ONLY=true
      fi
    fi
    ;;
esac

# CAMERA_ONLY=true explicitly disables database recording for model preview.
# AI_ONLY=true records camera decisions without requiring an Arduino connection.
export SHOW_AI_PREVIEW=false
export AI_PREVIEW_MODE=web
cd "$script_dir/../.."
exec "$python_bin" "$script_dir/controller/main.py"
