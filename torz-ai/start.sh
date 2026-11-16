#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/backend"
[ -x .venv/bin/python ] || { echo "Run ./install.sh first."; exit 1; }
exec .venv/bin/python -m torz.launcher start "$@"
