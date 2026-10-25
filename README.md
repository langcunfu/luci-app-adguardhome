# luci-app-adguardhome

基于原版 `luci-app-adguardhome` 修改，主要针对现代 OpenWrt 环境进行了 `nftables` 适配，并从 **v2.4.0** 开始完成 LuCI 前端 JavaScript 化。

当前 `main` 分支为 JavaScript 版本，旧版 Lua 实现保留在 [`lua`](https://github.com/w9315273/luci-app-adguardhome/tree/lua) 分支。

## 主要变化

### v2.4.0 — LuCI JavaScript 迁移

从 **v2.4.0** 开始，LuCI 页面由传统 Lua CBI / HTM 架构迁移至 JavaScript。

- LuCI 页面由 Lua CBI / HTM 迁移到 JavaScript
- 后端接口迁移到 `rpcd + ucode`
- 使用 LuCI RPC ACL 控制前后端权限
- 删除旧的 `luasrc/controller`、`luasrc/model/cbi` 和 HTM 页面
- 保留原有 AdGuardHome 配置方式与主要功能
- 优化 YAML 配置编辑与配置检查

### nftables DNS 重定向

将原版的 DNS 重定向实现从 `iptables` 迁移到 `nftables`，核心使用方式保持不变。

### WAN 设备排除

从 **v2.2.0** 开始，可直接在 LuCI 界面的 **WAN 接口** 选项中选择需要排除的网卡，无需手动编辑 `adguardhome.nft.tpl`。

该选项仅在 **「重定向」模式** 下生效，用于避免将来自公网接口的 DNS 请求重定向到本机，从而防止 AdGuardHome 被暴露为公共 DNS 解析器。

请仅选择直接面向公网的接口，例如：

- `eth0`
- `pppoe-wan`

### dnsmasq 上游模式

启用后，普通 DNS 查询仅转发给 AdGuardHome；按域名指定的上游规则继续保留，`/#/` 通配上游暂时移除。

启用前会持久保存原来的 `server`、`resolvfile` 和 `noresolv` 设置，停用或切换模式时恢复。启用期间对这些设置的手动修改会在恢复时被原备份覆盖。

从旧版升级时，如果旧版已删除自定义解析设置且没有备份，无法还原丢失的原值；兼容清理会移除旧 AdGuardHome 端点，并在没有普通上游时恢复系统 DNS。

## 界面

<img width="677" height="695" src="https://github.com/user-attachments/assets/4b436eec-8e05-4bf6-82d9-a972164e9659" />

<img width="536" height="714" src="https://github.com/user-attachments/assets/575c2d6c-e289-425d-91b9-faf01b5a7262" />
