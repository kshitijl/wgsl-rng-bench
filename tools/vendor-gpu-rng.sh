#!/bin/sh
# Refreshes web/gpu-rng/ from the site's public/demos/gpu-rng/, the source of these files.
set -e
cd "$(dirname "$0")/.."
SITE=${SITE:-$HOME/local-src/39-klauria-tech}
for f in web/gpu-rng/*; do cp "$SITE/public/demos/gpu-rng/$(basename "$f")" "$f"; done
echo "refreshed web/gpu-rng/ from $SITE"
