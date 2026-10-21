#!/usr/bin/env sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
docker compose --env-file "$script_dir/.env" -f "$script_dir/docker-compose.yml" down
