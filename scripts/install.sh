#!/bin/sh
set -e

REPO="w9315273/luci-app-adguardhome"
LANGUAGE=${1:-en}
case "$LANGUAGE" in
    en|zh-cn) ;;
    *) echo "Usage: sh install.sh [en|zh-cn]"; exit 1 ;;
esac
[ "$#" -le 1 ] || { echo "Usage: sh install.sh [en|zh-cn]"; exit 1; }

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

PACKAGE=luci-app-adguardhome
I18N_PACKAGE=luci-i18n-adguardhome-zh-cn
if printf '%s\n' "$RELEASE" | grep -Eq '"name"[[:space:]]*:[[:space:]]*"luci-app-adguardhome-tk-[^"]*\.apk"'; then
    PACKAGE=luci-app-adguardhome-tk
    I18N_PACKAGE=luci-i18n-adguardhome-tk-zh-cn
fi
URL="https://github.com/${REPO}/releases/download/${TAG}/${PACKAGE}-${VERSION}.apk"

echo "Version: $VERSION"
echo "Downloading..."
work=$(mktemp -d /tmp/agh-install.XXXXXX)
trap 'rm -rf "$work"' EXIT
uclient-fetch -qO "$work/main.apk" "$URL"
set -- "$work/main.apk"

I18N="${I18N_PACKAGE}-${VERSION}.apk"
has_i18n=0
if [ "$LANGUAGE" = zh-cn ] && printf '%s\n' "$RELEASE" | grep -Eq "\"name\"[[:space:]]*:[[:space:]]*\"${I18N_PACKAGE}-[^\"]*\\.apk\""; then
    uclient-fetch -qO "$work/zh-cn.apk" "https://github.com/${REPO}/releases/download/${TAG}/${I18N}"
    set -- "$@" "$work/zh-cn.apk"
    has_i18n=1
fi

if [ "$LANGUAGE" = zh-cn ] && [ "$PACKAGE" = luci-app-adguardhome-tk ] && [ "$has_i18n" != 1 ]; then
    echo "ERROR: The release is missing the Chinese package"
    exit 1
fi

legacy_packages=
if [ "$PACKAGE" = luci-app-adguardhome-tk ]; then
    installed=$(apk info)
    for old in luci-app-adguardhome luci-i18n-adguardhome-zh-cn; do
        if printf '%s\n' "$installed" | grep -qx "$old"; then
            if [ "$old" != luci-i18n-adguardhome-zh-cn ] || [ "$LANGUAGE" = zh-cn ]; then
                set -- "$@" "$old"
            fi
            legacy_packages="$legacy_packages $old"
        fi
    done
fi

echo "Installing..."
apk add --allow-untrusted "$@"
if [ -n "$legacy_packages" ]; then
    apk del $legacy_packages
fi

if [ "$LANGUAGE" = en ]; then
    installed=$(apk info)
    for translation in luci-i18n-adguardhome-zh-cn luci-i18n-adguardhome-tk-zh-cn; do
        if printf '%s\n' "$installed" | grep -qx "$translation"; then
            apk del "$translation"
        fi
    done
fi

echo "Refreshing LuCI..."
rm -f /tmp/luci-indexcache /tmp/luci-indexcache.* /tmp/luci-modulecache/* 2>/dev/null
/etc/init.d/rpcd reload >/dev/null 2>&1

echo "Done."
