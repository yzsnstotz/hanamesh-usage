# HanaMesh agent compatibility (PX2, 2026-11-09)

最低支持版本与 AH1 对齐：Claude Code **2.1.301**、Codex **0.162.1**。这两个数是 HanaMesh 的支持下限，不是宣称上游首次引入 plugins/hooks 的版本。无新版上限；矩阵每次解析 npm `latest` 并保存实际版本。最低版和最新版都必须通过。

## 官方接口依据

| 宿主 / 项目 | 当前契约及本插件处理 | 官方依据 |
| --- | --- | --- |
| Claude OS | macOS 13+；Windows 10 1809+/Server 2019+；Ubuntu 20.04+、Debian 10+、Alpine 3.19+。HanaMesh 的 Linux Node 归档是 glibc 版，因此不宣称 Alpine/musl 支持。架构支持最终取宿主与固定 Node 24.13.1 的交集。 | [system requirements](https://code.claude.com/docs/en/setup#system-requirements) |
| Codex OS | 官方提供 macOS/Linux、原生 Windows 的安装入口，npm 也是官方分发入口；WSL 是独立 Linux 环境。 | [CLI installation](https://learn.chatgpt.com/docs/cli), [Windows](https://learn.chatgpt.com/docs/windows/windows-sandbox) |
| Claude manifest | `.claude-plugin/plugin.json` 声明 name/version/description；skills、hooks、MCP 位于插件根；`hooks/hooks.json` 和 `.mcp.json` 自动发现。 | [manifest reference](https://code.claude.com/docs/en/plugins-reference) |
| Codex manifest | 当前使用官方支持的 `.codex-plugin/plugin.json` 清单，`hooks`、`skills`、`onboardingSkill`、`mcpServers` 在清单顶层；`extensions.com.openai` 只适用于根 `plugin.json`。显式选 `hooks/codex.json`，不会载入默认文件里的 Claude 专属事件。 | [package / structure / bundled hooks](https://developers.openai.com/plugins/build/plugins#plugin-structure) |
| Claude shell | shell form：Unix `sh -c`；Windows Git Bash，未装 Git Bash时可回落 PowerShell；可显式 `shell: bash/powershell`。本包显式 `shell: bash`，Windows 因此需要官方 Git for Windows；Bash 启动器转交原生 PowerShell，最终执行已校验的 node.exe。exec form 从 2.1.139 支持，但本包不用 PATH Node 启动器。 | [command hook fields](https://code.claude.com/docs/en/hooks#command-hook-fields), [Windows hooks](https://code.claude.com/docs/en/hooks#run-hooks-in-powershell-on-windows), [2.1.139 changelog](https://code.claude.com/docs/en/changelog#2-1-139) |
| Codex shell | `command` 为 shell command；Windows 使用官方 `commandWindows` 覆盖，调用 `powershell.exe -File` 入口，不要求 `/bin/sh`。插件 hooks 导出 `PLUGIN_ROOT`、`PLUGIN_DATA`，也导出 `CLAUDE_PLUGIN_ROOT`、`CLAUDE_PLUGIN_DATA` 兼容变量。本包 Unix 命令使用官方导出的 `CLAUDE_PLUGIN_ROOT`，Windows 覆盖使用 `PLUGIN_ROOT`。 | [commandWindows](https://learn.chatgpt.com/docs/hooks#configure-hooks), [plugin environment](https://developers.openai.com/plugins/build/plugins#bundle-lifecycle-hooks) |
| MCP | Claude 使用 root placeholder；Codex 使用配置中插件相对的 `cwd: .` 和 `./bin/hm-agent`。真实最低版 `codex mcp list --json` 可见原来的 `${CLAUDE_PLUGIN_ROOT}` 不展开，因此现在两个宿主独立声明，移除原来的占位符探测回落。Windows MCP 同样需要 Git for Windows 的 Bash。 | [MCP plugin packaging / paths](https://developers.openai.com/plugins/build/plugins), [Claude plugin components](https://code.claude.com/docs/en/plugins-reference#component-path-forms) |
| trust | 安装不自动批准 hooks；Codex 跳过未经审核信任的非 managed hooks。默认未同意时 HanaMesh 不解析工具 payload、不记录或上传；SessionStart 可输出一次 systemMessage 告知用户如何选择。 | [bundled hooks](https://developers.openai.com/plugins/build/plugins#bundle-lifecycle-hooks), [trust review](https://learn.chatgpt.com/docs/hooks) |

## 使用的 hook 输入

每次输入都是 stdin 上的一个 JSON 对象。公共字段：`session_id`、`transcript_path`、`cwd`、`hook_event_name`、`permission_mode`；Codex 另有 `model`，turn 级事件另有 `turn_id`。HanaMesh 不打开 transcript 路径，不保留输入/输出正文。下表字段是在公共字段之外的事件字段。

| 事件 | Claude Code | Codex | HanaMesh 行为 / 官方依据 |
| --- | --- | --- | --- |
| SessionStart | `source`、`model`，可含 `agent_type`；source 包括 startup/resume/clear/compact | `source`，还含 fork | 使用固定 `--event SessionStart`；输出 `systemMessage`。 [Claude](https://code.claude.com/docs/en/hooks#sessionstart), [Codex](https://learn.chatgpt.com/docs/hooks#sessionstart) |
| PreToolUse | `tool_name`、`tool_input`、`tool_use_id` | 同名三字段及 `turn_id` | 仅显式同意后投影最小摘要，未知结果不猜成功。[Claude](https://code.claude.com/docs/en/hooks#pretooluse), [Codex](https://learn.chatgpt.com/docs/hooks#pretooluse) |
| PostToolUse | 上述三字段及 `tool_response`、`duration_ms` | 上述三字段及 `tool_response`、`turn_id` | Codex Bash 非零退出也在此事件提供结果；不以 hook 自身 exit 0 判定插件成功。[Claude](https://code.claude.com/docs/en/hooks#posttooluse), [Codex](https://learn.chatgpt.com/docs/hooks#posttooluse) |
| PostToolUseFailure | `tool_name`、`tool_input`、`tool_use_id`、`error`、`is_interrupt`、`duration_ms` | 当前官方事件表未列此事件；不注册 | Claude 专用文件保留，Codex 专用文件移除。[Claude](https://code.claude.com/docs/en/hooks#posttoolusefailure), [Codex event list](https://learn.chatgpt.com/docs/hooks#hook-events) |

Claude changelog 的 2.1.119 已记录 PostToolUse/Failure 新增 `duration_ms`，2.1.139 新增 exec form；它们证明事件在此之前已存在，不能据此猜首次引入版本。当前两家文档没有为每个事件/字段/插件 overlay 提供完整首次发布版本表；未证实的历史版本保持“未确立”，不编造。Codex 官方 changelog 记录 2026-05-14 hooks GA，并有 0.162.1 发布项；HanaMesh 仍只支持上述已选定的较高下限。[Claude changelog](https://code.claude.com/docs/en/changelog), [Codex changelog](https://learn.chatgpt.com/docs/changelog#codex-cli-01621)。

## 运行时和验证

六个固定归档：darwin-arm64/x64、linux-arm64/x64、win-arm64/x64；SHA256 来源于 [Node 24.13.1 官方 SHASUMS](https://nodejs.org/dist/v24.13.1/SHASUMS256.txt)。运行时按现有做法显式下载到共享私有缓存，不在 Git 中提交六份二进制；receipt 的 `bundled:false` 保持真实。hooks/MCP 只运行准备好的缓存，不触发下载，不使用系统 PATH Node；SHA 不匹配、链接/重解析点及版本错误均停止。

`.github/workflows/px2-agent-plugin-compat.yml` 与 PX1 的 `px1-platform-matrix.yml` 分离。六个原生 runner × minimum/latest，共 12 格：四种要求的 runner 外，加 Linux/Windows arm64。官方 CLI 只执行版本、validate、marketplace add、install/add、list 和 MCP list；不运行推理，不登录，不使用 secrets/API key。安装时工作目录和 HOME/USERPROFILE/CLI 配置均隔离；npm 只使用临时空 npmrc。

`tools/agent-compat-smoke.mjs` 直接驱动清单中命令，输入来自上方官方字段表的合成样例；断言 7 个 hooks 返回、SessionStart 提示、withheld、local=0、无正文持久化，并对 agent Node 网络 API 设置 tripwire。此为命令执行验证，不冒充登录后的宿主自动分派/显示 ACK；Core 子进程使用生产白名单环境，不继承测试 NODE_OPTIONS。

待追认：新增 Windows Git for Windows 前置条件（Claude hooks 和两宿主 MCP 使用官方 Bash 执行入口）；额外两个 arm64 GitHub hosted runner 的采用。未扩大到付费 self-hosted/large runner。合并前必须读取真实矩阵结果，不能把 workflow 已添加当作各平台已通过。
