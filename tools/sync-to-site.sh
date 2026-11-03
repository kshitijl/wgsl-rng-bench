#!/bin/sh
# Copies web/wgsl-rng/ to the site's public/demos/wgsl-rng/ (the site never edits its copy).
# SITE defaults to ~/local-src/39-klauria-tech.
set -e
cd "$(dirname "$0")/.."
SITE=${SITE:-$HOME/local-src/39-klauria-tech}
rsync -a --delete web/wgsl-rng/ "$SITE/public/demos/wgsl-rng/"
echo "synced to $SITE/public/demos/wgsl-rng/ (commit it there)"
