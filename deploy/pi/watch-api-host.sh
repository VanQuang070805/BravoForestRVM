#!/usr/bin/env sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
env_file="$script_dir/.env"

while :; do
  if [ -f "$env_file" ]; then
    api_host=$(sed -n 's/^MANAGEMENT_API_HOST=//p' "$env_file" | tail -n 1 | tr -d '\r"')
    api_port=$(sed -n 's/^MANAGEMENT_API_PORT=//p' "$env_file" | tail -n 1 | tr -d '\r"')

    case "$api_host" in
      ''|*[!A-Za-z0-9.-]*) ;;
      *)
        case "$api_port" in
          ''|*[!0-9]*) ;;
          *)
            api_ip=$(getent ahostsv4 "$api_host" 2>/dev/null | awk 'NR == 1 { print $1; exit }' || true)
            case "$api_ip" in
              ''|*[!0-9.]*) ;;
              *)
                current_url=$(sed -n 's/^MANAGEMENT_API_URL=//p' "$env_file" | tail -n 1 | tr -d '\r"')
                desired_url="http://${api_ip}:${api_port}/api/v1"
                if [ "$current_url" != "$desired_url" ]; then
                  tmp_file=$(mktemp "$script_dir/.env.XXXXXX")
                  if awk -v url="$desired_url" '
                    /^MANAGEMENT_API_URL=/ { print "MANAGEMENT_API_URL=" url; updated=1; next }
                    { print }
                    END { if (!updated) print "MANAGEMENT_API_URL=" url }
                  ' "$env_file" > "$tmp_file"; then
                    chmod --reference="$env_file" "$tmp_file" 2>/dev/null || true
                    if docker compose --env-file "$tmp_file" -f "$script_dir/docker-compose.yml" up -d --force-recreate rvm-display; then
                      mv "$tmp_file" "$env_file"
                      echo "API host changed; refreshed kiosk service."
                      systemctl --user try-restart bravoforest-camera-ai.service >/dev/null 2>&1 || true
                    else
                      rm -f "$tmp_file"
                    fi
                  else
                    rm -f "$tmp_file"
                  fi
                fi
                ;;
            esac
            ;;
        esac
        ;;
    esac
  fi
  sleep 15
done
