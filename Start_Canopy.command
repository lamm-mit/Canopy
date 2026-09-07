#!/bin/bash
cd -- "$(dirname -- "$0")" || exit 1
if command -v python3 >/dev/null 2>&1; then
  python3 start.py
elif command -v node >/dev/null 2>&1; then
  node serve.mjs
else
  echo 'Canopy needs Python 3 or Node.js 18 or later. See README.md.'
  read -r -p 'Press Enter to close.'
fi
