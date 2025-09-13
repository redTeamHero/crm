#!/usr/bin/env bash
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHONPATH="${SCRIPT_DIR}/../metro2 (copy 1)/crm" python -m unittest discover -s "$SCRIPT_DIR" "$@"
