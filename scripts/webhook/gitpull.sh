#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
DEFAULT_REPO_DIR=""
DEFAULT_CANDIDATE="$(cd "${SCRIPT_DIR}/../.." 2>/dev/null && pwd -P || true)"
if [ -n "${DEFAULT_CANDIDATE}" ] && [ -d "${DEFAULT_CANDIDATE}/.git" ]; then
  DEFAULT_REPO_DIR="${DEFAULT_CANDIDATE}"
fi

REPO_DIR="${CRM_REPO_DIR:-${DEFAULT_REPO_DIR}}"
LOG_FILE="${GITPULL_LOG_FILE:-/var/log/gitpull.log}"

if [ -z "${REPO_DIR}" ]; then
  echo "CRM_REPO_DIR is not set and repository path could not be auto-detected" >&2
  exit 1
fi

if [ ! -d "${REPO_DIR}/.git" ]; then
  echo "Repository path '${REPO_DIR}' does not contain a .git directory" >&2
  exit 1
fi

cd "${REPO_DIR}"

git fetch origin main
git reset --hard origin/main

echo "✅ Repo updated on $(date)" >> "${LOG_FILE}"
