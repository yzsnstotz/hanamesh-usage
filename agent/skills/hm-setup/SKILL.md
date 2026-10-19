---
name: hm-setup
description: 只读检查 HanaMesh 使用记录的同意、配置、钩子与绑定前置条件。
---

先调用只读 `hanamesh_status`，准确转述未就绪原因；不要执行 setup、agree、consent、withdraw、bind-link，不要替用户批准钩子或绑定账号。

首次 SessionStart 会通过宿主的 `systemMessage` 通知给出“开启（本人在终端执行）”一行命令，使用当前实际 Node、安装目录及配置根；仅本人显式执行才开启。未操作保持关闭。普通工具钩子在未同意时静默。

开启后，符合规则的插件使用可计贡献积分并支持作者收入；仅记录时间、插件、功能、成败和渠道，不保存/上传对话、工具内容、文件或凭据；设置可随时关闭。通知内的 `withdraw` 一行命令用于关闭；原有 `consent --agree` 继续有效。

`serverOrigin` 和 `websiteOrigin` 都必填；缺失时按变量名报告 blocked，不编造默认地址，也不声称已自动配置。本机运行时使用套件的固定 Node 24.13.1（含 node:sqlite），不查系统 PATH；目前此启动器支持 macOS arm64/x64，其它平台具名 unsupported，尚未验证。首次由用户在终端运行 `/bin/sh "$PLUGIN/bin/hm-agent" install-runtime`（PLUGIN 为实际已安装目录），按本机架构直接从 nodejs.org 下载并校验固定 SHA256，打印阶段/进度。`setup` 也会先完成同一运行时准备；原有 Node 25/其它版本不改动。运行时位于 Core 共享根下的 runtime 目录；未就绪/校验失败时报告具名错误，不偷偷回落系统 Node。实际后端/网站地址由用户独立配置；不得猜测端口或连接生产。

安装不等于钩子已获信任；只说明宿主当前状态与现有审核入口，不能替用户 Trust。通知成功写出只记 `emitted` 提示元数据，不能声称宿主已展示、用户已阅读或已同意。

同意、上传、服务端接收、账号绑定与计分是独立事实。没有名单/协议时明确上传停止。未知成败保持 null；外层脚本成功不证明内层插件成功。撤回 pending 保持关闭，只有匹配代次的 committed 屏障或 Core 公开的 no-device 屏障才确认删除；完成前不能重新开启。
