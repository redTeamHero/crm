#!/bin/bash
set -euo pipefail

REPO_DIR="/home/admin/crm/metro2 (copy 1)/crm"
LOG_FILE="/var/log/gitpull.log"

cd "${REPO_DIR}"

git fetch origin main
git reset --hard origin/main

echo "✅ Repo updated on $(date)" >> "${LOG_FILE}"
