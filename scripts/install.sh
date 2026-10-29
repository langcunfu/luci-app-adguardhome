#!/bin/sh
set -e

REPO="w9315273/luci-app-adguardhome"

echo "Getting latest version..."
RELEASE=$(uclient-fetch -qO- "https://api.github.com/repos/${REPO}/releases/latest" 2>/dev/null)
TAG=$(printf '%s\n' "$RELEASE" | sed -n 's/.*"tag_name":[[:space:]]*"\([^"]*\)".*/\1/p' | head -n1)

[ -n "$TAG" ] || { echo "ERROR: Failed to get latest version"; exit 1; }

case "$TAG" in
  *-*) ;;
  *) echo "ERROR: Unexpected tag format: $TAG"; exit 1 ;;
esac

VERSION=${TAG#v}
VERSION=${VERSION%-*}-r${VERSION##*-}

URL="https://github.com/${REPO}/releases/download/${TAG}/luci-app-adguardhome-${VERSION}.apk"

echo "Version: $VERSION"
echo "Downloading..."
work=$(mktemp -d /tmp/agh-install.XXXXXX)
trap 'rm -rf "$work"' EXIT
uclient-fetch -qO "$work/main.apk" "$URL"
set -- "$work/main.apk"

I18N="luci-i18n-adguardhome-zh-cn-${VERSION}.apk"
if printf '%s\n' "$RELEASE" | grep -Eq '"name"[[:space:]]*:[[:space:]]*"luci-i18n-adguardhome-zh-cn-[^"]*\.apk"'; then
    uclient-fetch -qO "$work/zh-cn.apk" "https://github.com/${REPO}/releases/download/${TAG}/${I18N}"
    set -- "$@" "$work/zh-cn.apk"
fi

echo "Installing..."
apk add --allow-untrusted "$@"

echo "Refreshing LuCI..."
rm -f /tmp/luci-indexcache /tmp/luci-indexcache.* /tmp/luci-modulecache/* 2>/dev/null
/etc/init.d/rpcd reload >/dev/null 2>&1

echo "Done."
