#!/bin/bash
set -e

cd "metro2 (copy 1)/crm"
npm install --prefer-offline --no-audit --no-fund 2>&1 | tail -5

if [ -f scripts/runMigrations.js ]; then
  node scripts/runMigrations.js || true
fi

echo "Post-merge setup complete."
