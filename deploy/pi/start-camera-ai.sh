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

export CAMERA_ONLY=true
export SHOW_AI_PREVIEW=false
export AI_PREVIEW_MODE=web
cd "$script_dir/../.."
exec "$python_bin" "$script_dir/controller/main.py"
