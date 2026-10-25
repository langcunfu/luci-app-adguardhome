#!/bin/sh

PATH="/usr/sbin:/usr/bin:/sbin:/bin"
update_mode=$1

# Keep the lock file: unlinking it would allow a second lock on a new inode.
exec 9>/var/lock/AdGuardHome-update.lock || exit 1
# Allow a brief status probe to finish before treating the lock as busy.
if ! flock -w 1 9; then
	printf '%s\n' '已经有更新任务正在运行，请等待其结束。'
	exit 2
fi

# Only the lock owner may reset the log and update status.
exec >/tmp/AdGuardHome_update.log 2>&1
cleanup() {
	local result=$?
	trap - EXIT
	[ "$result" -ne 0 ] && touch /var/run/update_core_error
	rm -f /var/run/update_core
	exit "$result"
}
trap cleanup EXIT
trap 'exit 1' TERM INT HUP
rm -f /var/run/update_core_error
touch /var/run/update_core
binpath=$(uci get AdGuardHome.AdGuardHome.binpath 2>/dev/null)
if [ -z "$binpath" ]; then
	uci set AdGuardHome.AdGuardHome.binpath="/tmp/AdGuardHome/AdGuardHome"
	binpath="/tmp/AdGuardHome/AdGuardHome"
fi
[ ! -d "${binpath%/*}" ] && mkdir -p "${binpath%/*}"
enabled=$(uci get AdGuardHome.AdGuardHome.enabled 2>/dev/null)
core_api_url="https://api.github.com/repos/AdguardTeam/AdGuardHome/releases/latest"

Check_Updates(){
	downloader_cmd="uclient-fetch"
	downloader_opts="-T 5 -q -O"
	downloader_quiet_opts="-q -O -"
	printf "%s\n" "开始检查更新, 请耐心等待 ..."
	Cloud_Version="$(${downloader_cmd} ${downloader_quiet_opts} "$core_api_url" 2>/dev/null | sed -n 's/.*"tag_name":[ ]*"\(v[^"]*\)".*/\1/p' | head -n 1)"
	[ -z "$Cloud_Version" ] && printf "\n检查更新失败, 请检查网络或稍后重试!\n" && EXIT 1
	if [ -f "$binpath" ]; then
		Current_Version="$($binpath --version 2>/dev/null | sed -n 's/.*\(v[0-9][0-9.]*\).*/\1/p' | head -n 1)"
	else
		Current_Version="未知"
	fi
	[ -z "$Current_Version" ] && Current_Version="未知"
	printf "\n执行文件路径: %s\n\n正在检查更新, 请耐心等待 ...\n" "${binpath%/*}"
	printf "\n当前 AdGuardHome 版本: %s\n云端 AdGuardHome 版本: %s\n" "$Current_Version" "$Cloud_Version"
	if [ "$Cloud_Version" != "$Current_Version" ] || [ "$1" = force ]; then
		Update_Core
	else
		printf "\n已是最新版本, 无需更新!\n"
		EXIT 0
	fi
	EXIT 0
}

Update_Core(){
	rm -rf /tmp/AdGuardHome_Update > /dev/null 2>&1
	mkdir -p "/tmp/AdGuardHome_Update"
	GET_Arch
	link="https://github.com/AdguardTeam/AdGuardHome/releases/download/${Cloud_Version}/AdGuardHome_linux_${Arch}.tar.gz"
	printf "%s\n" "下载链接:${link}"
	printf "%s\n" "文件名称:${link##*/}"
	printf "\n开始下载 AdGuardHome 核心文件 ...\n\n"
	${downloader_cmd} ${downloader_opts} "/tmp/AdGuardHome_Update/${link##*/}" "$link" > /dev/null 2>&1
	if [ $? -ne 0 ]; then
		printf "\nAdGuardHome 核心下载失败，请检查网络、系统时间及 CA 证书 ...\n"
		rm -rf /tmp/AdGuardHome_Update
		EXIT 1
	fi 
	if [ "${link##*.}" = "gz" ]; then
		printf "\n正在解压 AdGuardHome ...\n"
		tar -zxf "/tmp/AdGuardHome_Update/${link##*/}" -C "/tmp/AdGuardHome_Update/"
		if [ ! -e /tmp/AdGuardHome_Update/AdGuardHome ]
		then
			printf "%s\n" "AdGuardHome 核心解压失败!"
			rm -rf "/tmp/AdGuardHome_Update" > /dev/null 2>&1
			EXIT 1
		fi
		downloadbin="/tmp/AdGuardHome_Update/AdGuardHome/AdGuardHome"
	else
		downloadbin="/tmp/AdGuardHome_Update/${link##*/}"
	fi
	chmod +x "$downloadbin"
	size_bytes=$(wc -c < "$downloadbin" 2>/dev/null || echo 0)
	printf "\nAdGuardHome 核心体积: %s\n" "$(awk -v bytes="$size_bytes" 'BEGIN{printf "%.2fMB", bytes/1000000}')"
	/etc/init.d/AdGuardHome stop 9>&- > /dev/null 2>&1
	printf "\n移动 AdGuardHome 核心文件到 %s ...\n" "${binpath%/*}"
	if ! mv -f "$downloadbin" "$binpath" > /dev/null 2>&1 || [ ! -s "$binpath" ]; then
		printf "AdGuardHome 核心移动失败!\n可能是设备空间不足导致, 请尝试更改 [执行文件路径] 为 /tmp/AdGuardHome\n"
		EXIT 1
	fi
	rm -rf /tmp/AdGuardHome_Update
	chmod +x "$binpath"
	if [ "$enabled" = 1 ]; then
		printf "\n正在重启 AdGuardHome 服务...\n"
		/etc/init.d/AdGuardHome restart 9>&- > /dev/null 2>&1
	fi
	printf "\nAdGuardHome 核心更新成功!\n"
}

GET_Arch() {
	if command -v apk > /dev/null 2>&1; then
		PM="apk"
	elif command -v opkg > /dev/null 2>&1; then
		PM="opkg"
	else
		printf "%s\n" "未找到包管理器 (apk/opkg)!" && EXIT 1
	fi
	case "${PM}" in
	apk)
		Archt="$(apk info -a kernel 2>/dev/null | grep Architecture | awk -F ":[ ]*" '{print $2}')"
		[ -z "$Archt" ] && Archt="$(uname -m)"
	;;
	opkg)
		Archt="$(opkg info kernel | grep Architecture | awk -F "[ _]" '{print($2)}')"
	;;
	esac
	case "${Archt}" in
	i386)
		Arch=i386
	;;
	i686)
		Arch=i386
	;;
	x86|x86_64)
		Arch=amd64
	;;
	mipsel)
		Arch=mipsle_softfloat
	;;
	mips)
		Arch=mips_softfloat
	;;
	mips64el)
		Arch=mips64le_softfloat
	;;
	mips64)
		Arch=mips64_softfloat
	;;
	arm)
		Arch=arm
	;;
	armeb)
		Arch=armeb
	;;
	aarch64)
		Arch=arm64
	;;
	*)
		printf "\nAdGuardHome 暂不支持当前的设备架构: [%s]!\n" "$Archt"
		EXIT 1
	esac
	printf "\n当前设备架构: %s\n" "$Arch"
}

EXIT(){
	exit "$1"
}

Check_Updates "$update_mode"
