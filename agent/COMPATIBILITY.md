# Agent 0.2.9 compatibility

基线：现行 Agent028 + Usage rc.18；保留自动后台准备、本机最小记录、网站同意并绑定后才上传。Claude Code ≥2.1.301、Codex ≥0.162.1，与 AH1 一致，无新版本上限。这是 HanaMesh 支持下限，不是假称上游首次支持版本。

| 接口 | 当前官方契约 / 本包处理 | 官方依据 |
|---|---|---|
| Claude OS | macOS13+、Windows10 1809+/Server2019+、Ubuntu20.04+/Debian10+/Alpine3.19+。本包固定 Node 使用官方 macOS、glibc Linux、Windows 的 arm64/x64 归档；因此不宣称 Alpine/musl 支持。有效 OS 下限取 CLI 与 Node24.13.1 支持交集，Actions runner 结果不代证全部旧 OS。 | [setup](https://code.claude.com/docs/en/setup#system-requirements), [Node supported platforms](https://github.com/nodejs/node/blob/v24.13.1/BUILDING.md#platform-list) |
| Codex OS | 官方有 macOS/Linux、原生 Windows 安装入口和 npm 分发；WSL 为独立 Linux 环境。 | [CLI](https://learn.chatgpt.com/docs/cli), [Windows](https://learn.chatgpt.com/docs/windows/windows-sandbox) |
| Claude 清单 | `.claude-plugin/plugin.json` 的 name/version/description；根目录 skills、默认 hooks/hooks.json、.mcp.json。 | [manifest](https://code.claude.com/docs/en/plugins-reference) |
| Codex 清单 | 官方支持的 `.codex-plugin/plugin.json` overlay 顶层 hooks/skills/onboardingSkill/mcpServers。本包显式选择 hooks/codex.json；根 plugin.json 才承载 extensions.com.openai，不能把它嵌进兼容清单。 | [plugin packaging](https://developers.openai.com/plugins/build/plugins#plugin-structure) |
| Claude 执行 | Unix shell form 为 sh；Windows 支持 Git Bash，未装时可用 PowerShell；可显式 shell。本包 `shell:bash`，Windows Git Bash 转原生 hm-agent.ps1；不调用 Windows Perl，不使用 WSL。 | [command hook fields](https://code.claude.com/docs/en/hooks#command-hook-fields), [Windows hooks](https://code.claude.com/docs/en/hooks#run-hooks-in-powershell-on-windows) |
| Codex 执行 | 官方 commandWindows 为 Windows 覆盖；本包调用系统 Windows PowerShell5.1。插件环境有 PLUGIN_ROOT/PLUGIN_DATA，同时有 CLAUDE_PLUGIN_ROOT/CLAUDE_PLUGIN_DATA 别名。官方文档未为所有 CLI 版本固定内部 shell 实现，本包直接命令驱动测试不能冒称登录会话自动分派已验收。 | [hooks](https://learn.chatgpt.com/docs/hooks), [plugin hooks/env](https://developers.openai.com/plugins/build/plugins#bundle-lifecycle-hooks) |
| MCP | Claude 使用 CLAUDE_PLUGIN_ROOT；Codex 使用显式插件 cwd 与 ./bin/hm-agent，避免最低版实际 CLI 保留未展开 placeholder。Windows MCP 使用 Git for Windows Bash，准备与运行时进程使用系统 Windows PowerShell5.1/Node。 | [plugin paths](https://developers.openai.com/plugins/build/plugins) |
| 审核 | 安装不授予 hook trust；Codex 非 managed hooks 必须本人审核信任。网站 usage consent、绑定、上传与计分仍是独立事实，未同意不上传；禁用/撤回关闭本机记录。 | [bundled hooks](https://developers.openai.com/plugins/build/plugins#bundle-lifecycle-hooks), [hook trust](https://learn.chatgpt.com/docs/hooks) |

公共输入为 stdin 的一个 JSON 对象：session_id、transcript_path、cwd、hook_event_name、permission_mode；Codex 另有 model，turn 事件有 turn_id。本包不读取 transcript，不保存 prompt、原始工具输入输出或凭据。准备期仅保留原时间、哈希调用身份、插件/功能选择器、已知成败；未知结果保持 null。

| 使用事件 | Claude 附加字段 | Codex 附加字段 / 处理 | 官方参考 |
|---|---|---|---|
| SessionStart | source、model，可含 agent_type；startup/resume/clear/compact | source，另可 fork；当前产品主会话提醒规则保留 | [Claude](https://code.claude.com/docs/en/hooks#sessionstart), [Codex](https://learn.chatgpt.com/docs/hooks#sessionstart) |
| PreToolUse | tool_name/tool_input/tool_use_id | 同名字段及 turn_id | [Claude](https://code.claude.com/docs/en/hooks#pretooluse), [Codex](https://learn.chatgpt.com/docs/hooks#pretooluse) |
| PostToolUse | 同上及 tool_response、duration_ms | 同上及 tool_response、turn_id；Bash 非零退出仍走此事件 | [Claude](https://code.claude.com/docs/en/hooks#posttooluse), [Codex](https://learn.chatgpt.com/docs/hooks#posttooluse) |
| PostToolUseFailure | tool_name/tool_input/tool_use_id/error/is_interrupt/duration_ms | 当前 Codex 事件表未列出，因此只注册到 Claude | [Claude](https://code.claude.com/docs/en/hooks#posttoolusefailure), [Codex event list](https://learn.chatgpt.com/docs/hooks) |

[Claude changelog](https://code.claude.com/docs/en/changelog) 的 2.1.119 已记录 duration_ms，2.1.139 引入 exec args；[Codex changelog](https://learn.chatgpt.com/docs/changelog) 记录 2026-05-14 hooks GA 和 0.162.1 发布。官方未给逐事件/字段/overlay 的完整首次版本表，无法确立的历史版本不编造；最低档与 latest 实际版本由无登录原生安装门记录。

六个归档 SHA/字节数在 `bin/node-runtime.json`，来源 [Node24.13.1 SHASUMS](https://nodejs.org/dist/v24.13.1/SHASUMS256.txt) 和对应 HTTPS HEAD。缓存按实际 OS/CPU命名；任何版本/校验/链接异常停止，不回落 PATH Node。自动后台准备、失败下一新会话重试、闭合记录、MCP readiness/交接均保留。Windows 通过 OS file lease 串行发布，处理 [ARM/x64 emulation](https://learn.microsoft.com/en-us/windows/arm/apps-on-arm-x86-emulation) 下的原生架构选择。

测试仅在公开 Actions 标准 runner：六平台 × minimum/latest。严格目标 build、POSIX/Windows 各自真实桥接用例、官方 CLI validate/install/list/MCP list、真实 hooks 命令 + 官方字段合成 JSON；网站未同意时 HTTP 上传 tripwire，显式本机关闭后零记录，无真实账号/模型/API key。Core 子进程保留生产环境白名单，不继承测试预加载器；其 consent/upload 权限边界由既有 Core 契约和本门明确状态检查共同验证。直接 payload 驱动不冒充真实用户库存、已 Trust 的登录会话或 UI 展示 ACK。

待追认：Windows Git for Windows、Linux 完整 Perl；两个额外 arm64 hosted runner；单 job25分钟期限；Windows 原生冷 shell10秒测试门。原 POSIX500ms门不变；计时敏感文件串行供给以避免其它测试的哈希/压缩争抢，文件内并发竞争用例保留，此供给方式待追认。此处的待追认标记不把失败或取消算 PASS。

Windows 后台派生辅助程序集为 Actions 以 `bin/windows-detached.cs` 编译的 AnyCPU .NET Framework4 资产；来源提交与源码/二进制 SHA256 固定于 `bin/windows-detached.json`。构建和物化均核对两个 SHA；运行时对同一份 DLL 字节校验后加载，不在用户目录运行 C# 编译器。此方式避开 .NET Framework 编译器在中文 TEMP/输出目录的失败，支持标准 系统 Windows PowerShell5.1；原生 x64/arm64 后台准备门验证相同资产，损坏即拒绝派生。本次 5.1 / IsWow64Process2 资产构建证据：[Actions 42484294442 helper job](https://github.com/yzsnstotz/hanamesh-usage/actions/runs/42484294442)；该 run 的红回归 job 不作矩阵 PASS。

Windows 入口统一使用系统自带 Windows PowerShell5.1（powershell.exe），后台复用已选择的同一个可执行文件；不要求安装 PowerShell7，不要求 Shell 与 Node 同 ISA。固定 AnyCPU .NET Framework4 辅助 DLL 使用系统 Kernel32 IsWow64Process2 读取 native machine，选择并验证固定原生 Node；不信任 Git Bash 改写的 PROCESSOR_ARCHITECTURE。返修门在 windows-latest/windows-11-arm × CLI minimum/latest 全程移除 PATH 中含 pwsh.exe 的目录，明确检查 5.1，覆盖冷/暖、准备/恢复、MCP 交接与碎片输入、官方 Bash 冷载荷。Windows10 历史 OS 不因 Windows11 hosted 门自动成为已验收范围。

R128 返修验证：准备队列接受 Codex canonical `Bash` + `tool_input.command`；真实冷 Pre/Post 必须恰好补录一条、保原时间、不落原路径。候选隐私门通过两档官方 CLI 安装实际 target，保持四条可归属本机记录断言；专用回环端点区分目录/绑定准备和 usage POST，实际声明的 MCP initialize 后观察 sender.json 的 CONSENT_WITHHELD tick，关闭并重启后保持零记录/零发送。正控制在候选副本的 uploadOnce 内绕过同意发 POST，必须由同一请求计数断言击杀。生产 Core 环境白名单不变。
