#!/usr/bin/env sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
venv_dir="$script_dir/.venv"

python3 -m venv --system-site-packages "$venv_dir"
"$venv_dir/bin/python" -m pip install --upgrade pip
"$venv_dir/bin/python" -m pip install \
  "torch==2.14.1+cpu" \
  "torchvision==0.29.1+cpu" \
  --index-url https://download.pytorch.org/whl/cpu
"$venv_dir/bin/python" -m pip install -r "$script_dir/controller/requirements.txt"

echo "Da cai Pi AI controller vao $venv_dir"
echo "Neu dung Pi Camera CSI: sudo apt install python3-picamera2"
