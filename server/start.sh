#!/bin/sh
set -eu

if [ ! -d /data ] || [ ! -w /data ]; then
  echo "The persistent data directory /data is missing or not writable."
  exit 1
fi

if [ ! -f /data/autocare.db ]; then
  cp /app/seed/autocare.db /data/autocare.db
fi

export DATABASE_URL="file:/data/autocare.db"
node /app/server/dist/restoreBackup.js
node /app/server/dist/migrate.js
if [ ! -f /data/.users-secured ]; then
  export INITIAL_ADMIN_PASSWORD=admin
  node /app/server/dist/bootstrapUsers.js
  touch /data/.users-secured
fi
if [ ! -f /data/.default-admin-credentials-set ]; then
  node /app/server/dist/setInitialAdminCredentials.js
  touch /data/.default-admin-credentials-set
fi
unset INITIAL_ADMIN_PASSWORD
exec node /app/server/dist/index.js
