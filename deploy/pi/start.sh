#!/usr/bin/env sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
env_file="$script_dir/.env"
compose_file="$script_dir/docker-compose.yml"

if [ ! -f "$env_file" ]; then
  cp "$script_dir/.env.example" "$env_file"
  echo "Da tao deploy/pi/.env. Hay dien IP may quan ly, RVM_MACHINE_ID va RVM_API_KEY roi chay lai."
  exit 1
fi

machine_id=$(sed -n 's/^RVM_MACHINE_ID=//p' "$env_file" | tail -n 1 | tr -d '\r"')
machine_key=$(sed -n 's/^RVM_API_KEY=//p' "$env_file" | tail -n 1 | tr -d '\r"')
api_url=$(sed -n 's/^MANAGEMENT_API_URL=//p' "$env_file" | tail -n 1 | tr -d '\r"')
case "$machine_id" in
  ''|*[!0-9]*) echo "RVM_MACHINE_ID phải là ID máy dạng số được cấp trong trang quản trị." >&2; exit 1 ;;
esac
if [ "$machine_id" -lt 1 ]; then
  echo "RVM_MACHINE_ID phải lớn hơn 0." >&2
  exit 1
fi
case "$machine_key" in
  ''|*replace-with*|*your-api-key*|*change-me*) echo "RVM_API_KEY chưa được cấu hình bằng key thật của máy." >&2; exit 1 ;;
esac
case "$api_url" in
  http://*|https://*) ;;
  *) echo "MANAGEMENT_API_URL phải là địa chỉ http(s) có thể truy cập từ Pi." >&2; exit 1 ;;
esac

docker compose --env-file "$env_file" -f "$compose_file" up -d --build rvm-display
docker compose --env-file "$env_file" -f "$compose_file" ps rvm-display
echo "Giao dien RVM: http://127.0.0.1:3002"
