#!/usr/bin/env bash
# TORZ AI installer for macOS / Linux (Windows users: run INSTALL.bat).
set -euo pipefail
cd "$(dirname "$0")"
echo "== TORZ AI installer =="

PY=""
for c in python3.12 python3.13 python3.11 python3.14 python3.10 python3; do
  if command -v "$c" >/dev/null 2>&1 && "$c" -c 'import sys; sys.exit(0 if (3,10) <= sys.version_info[:2] <= (3,14) else 1)' 2>/dev/null; then
    PY="$c"; break
  fi
done
[ -n "$PY" ] || { echo "Python 3.10-3.14 is required. Install it and run ./install.sh again."; exit 1; }
echo "[1/4] Using $($PY --version)"

[ -x backend/.venv/bin/python ] || "$PY" -m venv backend/.venv
VPY="$PWD/backend/.venv/bin/python"
echo "[2/4] Installing dependencies ..."
"$VPY" -m pip install -q --upgrade pip --disable-pip-version-check
"$VPY" -m pip install -q -r backend/requirements.txt --disable-pip-version-check
"$VPY" -m pip install -q -r backend/requirements-ocr.txt --disable-pip-version-check || echo "  [!] OCR engine not installed; scanned PDFs will not be readable."

if [ ! -f frontend/dist/index.html ]; then
  command -v npm >/dev/null 2>&1 || { echo "frontend/dist is missing and Node.js is not installed."; exit 1; }
  echo "[3/4] Building the interface ..."
  (cd frontend && npm ci && npm run build)
else
  echo "[3/4] Interface already built."
fi

(cd backend && "$VPY" -c "import torz.main, torz.launcher; print('[4/4] Self-check passed.')")
command -v ollama >/dev/null 2>&1 && echo "Ollama found. Download a model with: ollama pull llama3.2:3b" \
  || echo "Optional: install Ollama from https://ollama.com/download for free local AI."
echo "Done. Start TORZ AI with ./start.sh"
