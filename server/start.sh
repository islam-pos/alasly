#!/bin/sh
set -eu

if [ -n "${RAILWAY_PROJECT_ID:-}" ] && [ "${RAILWAY_VOLUME_MOUNT_PATH:-}" != "/data" ]; then
  echo "A Railway persistent volume must be mounted at /data."
  exit 1
fi

if [ ! -d /data ] || [ ! -w /data ]; then
  echo "The persistent data directory /data is missing or not writable."
  exit 1
fi

if [ ! -f /data/autocare.db ]; then
  cp /app/seed/autocare.db /data/autocare.db
fi

export DATABASE_URL="file:/data/autocare.db"
if [ ! -f /data/.users-secured ]; then
  if [ -z "${INITIAL_ADMIN_PASSWORD:-}" ]; then
    echo "Set INITIAL_ADMIN_PASSWORD (16-72 bytes) before the first deployment."
    exit 1
  fi
  node /app/server/dist/bootstrapUsers.js
  touch /data/.users-secured
fi
unset INITIAL_ADMIN_PASSWORD
exec node /app/server/dist/index.js
