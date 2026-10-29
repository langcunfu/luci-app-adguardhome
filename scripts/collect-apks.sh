#!/usr/bin/env bash
set -euo pipefail
mkdir -p "$GITHUB_WORKSPACE/dist"
for package in "$PKG_DIR_NAME" luci-i18n-adguardhome-tk-zh-cn; do
  mapfile -t packages < <(find "$SDK_DIR/bin/packages" -type f -name "${package}-*.apk")
  if (( ${#packages[@]} == 0 )); then
    echo "::error::Missing APK: ${package}"
    exit 1
  fi
  cp "${packages[@]}" "$GITHUB_WORKSPACE/dist/"
done
