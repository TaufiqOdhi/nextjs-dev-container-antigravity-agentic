#!/bin/bash
set -e

# ---------------------------------------------------------------------------
# Entrypoint: ensures node_modules are installed before running the CMD.
# On first boot the named volume is empty, so npm install populates it.
# On subsequent boots it only installs if package.json has changed.
# ---------------------------------------------------------------------------

MARKER="/app/node_modules/.package-json-hash"
CURRENT_HASH="$(md5sum /app/package.json | awk '{print $1}')"

if [ ! -d "/app/node_modules" ] || [ ! -f "$MARKER" ] || [ "$CURRENT_HASH" != "$(cat "$MARKER" 2>/dev/null)" ]; then
  echo "[entrypoint] Installing/updating node_modules..."
  npm install
  echo "$CURRENT_HASH" > "$MARKER"
else
  echo "[entrypoint] node_modules up to date, skipping npm install."
fi

# Execute the CMD passed to the container (e.g. npm run dev)
exec "$@"
