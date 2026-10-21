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

docker compose --env-file "$env_file" -f "$compose_file" up -d --build rvm-display
docker compose --env-file "$env_file" -f "$compose_file" ps rvm-display
echo "Giao dien RVM: http://127.0.0.1:3002"
