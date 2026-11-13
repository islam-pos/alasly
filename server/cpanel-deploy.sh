#!/bin/bash
set -eo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
home_directory="${HOME:?cPanel HOME is not set}"
application_root="$home_directory/autocare-erp"
node_environment="$home_directory/nodevenv/autocare-erp/server/22/bin/activate"

if [[ ! -f "$node_environment" ]]; then
  echo "The cPanel Node.js 22 environment could not be found: $node_environment" >&2
  exit 1
fi

if [[ ! -d "$application_root/server" || ! -d "$application_root/client" ]]; then
  echo "The cPanel application directories were not found under $application_root" >&2
  exit 1
fi

. "$node_environment"

install_dependencies() {
  local project_root="$1"
  local installed_lock="$project_root/node_modules/.package-lock.json"

  if [[ -f "$installed_lock" \
    && ! "$project_root/package.json" -nt "$installed_lock" \
    && ! "$project_root/package-lock.json" -nt "$installed_lock" ]]; then
    echo "Reusing installed dependencies for $project_root"
    return
  fi

  echo "Installing build dependencies for $project_root"
  npm ci --prefix "$project_root" --include=dev
}

install_dependencies "$repository_root/server"
install_dependencies "$repository_root/client"

if [[ ! -f "$repository_root/server/generated/prisma/index.js" \
  || ! -f "$repository_root/server/generated/prisma/libquery_engine-debian-openssl-1.0.x.so.node" ]]; then
  echo "The committed Prisma client or its cPanel Linux engine is missing; regenerate and commit it before deploying." >&2
  exit 1
fi

echo "Building server with the committed Prisma client"
npm --prefix "$repository_root/server" run build
if [[ ! -f "$repository_root/client/dist/index.html" ]]; then
  echo "The prebuilt client is missing; build it locally and commit client/dist before deploying." >&2
  exit 1
fi
echo "Using the prebuilt client from $repository_root/client/dist"

mkdir -p \
  "$application_root/server/src" \
  "$application_root/server/dist" \
  "$application_root/server/generated/prisma" \
  "$application_root/server/prisma" \
  "$application_root/client/dist"

cp -a "$repository_root/server/src/." "$application_root/server/src/"
cp -a "$repository_root/server/dist/." "$application_root/server/dist/"
cp -a "$repository_root/server/generated/prisma/." "$application_root/server/generated/prisma/"
cp -a "$repository_root/client/dist/." "$application_root/client/dist/"
cp -f "$repository_root/server/cpanel-start.cjs" "$application_root/server/cpanel-start.cjs"
cp -f "$repository_root/server/package.json" "$application_root/server/package.json"
cp -f "$repository_root/server/package-lock.json" "$application_root/server/package-lock.json"
cp -f "$repository_root/server/tsconfig.json" "$application_root/server/tsconfig.json"
cp -f "$repository_root/server/prisma/schema.prisma" "$application_root/server/prisma/schema.prisma"

echo "Built application files deployed from $repository_root to $application_root"
