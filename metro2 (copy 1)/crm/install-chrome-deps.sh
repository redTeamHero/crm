#!/usr/bin/env bash
set -e

# Installs libraries required by Chromium for Puppeteer.
# Currently supports Debian/Ubuntu systems with apt-get.

if ! command -v apt-get >/dev/null 2>&1; then
  echo "apt-get not found. Please install libnss3 and libnspr4 using your package manager."
  exit 0
fi

if [ "$EUID" -ne 0 ]; then
  echo "This script requires root privileges. Re-run with sudo." >&2
  exit 1
fi

apt-get update
apt-get install -y libnss3 libnspr4
