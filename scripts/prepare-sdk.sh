#!/usr/bin/env bash
set -euo pipefail
cd "$SDK_DIR"

if [[ ! -x scripts/feeds ]]; then
  runuser -u buildbot -- bash ./setup.sh
fi

mkdir -p dl
chown -R buildbot:buildbot dl
