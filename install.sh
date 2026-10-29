#!/bin/sh
set -e

# Keep installation commands from existing releases working.
script=$(mktemp /tmp/install-adguardhome.XXXXXX)
trap 'rm -f "$script"' EXIT
uclient-fetch -O "$script" https://raw.githubusercontent.com/w9315273/luci-app-adguardhome/main/scripts/install.sh
sh "$script"
