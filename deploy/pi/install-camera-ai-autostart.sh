#!/usr/bin/env sh
set -eu

# Keep the old command path working for installations that already use it.
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec sh "$script_dir/install-camera-ai-service.sh" "$@"
