# HanaMesh agent suite

Hooks and MCP use `bin/hm-agent`, not `node` from PATH. The public launcher currently supports macOS arm64 and x64; other platforms return `HANAMESH_NODE_PLATFORM_UNSUPPORTED` and are not claimed as tested. System Node 25 or other runtimes are left alone.

Before the first session, run `/bin/sh "$PLUGIN/bin/hm-agent" install-runtime`, where PLUGIN is the actual installed directory. The launcher selects this architecture, downloads Node 24.13.1 directly over HTTPS from nodejs.org, verifies the fixed official archive SHA256, and publishes a private cache under `${HANAMESH_SHARED_HOME:-$HOME/.hanamesh-shared}/runtime/`. Stages and transfer progress go to stderr. Concurrent identical downloads may publish the same bytes; conflicting or corrupt caches stop with a named error, never a PATH fallback or retry. Hooks/MCP only execute an already prepared runtime and never begin a download.

`/bin/sh "$PLUGIN/bin/hm-agent" setup <serverOrigin> <websiteOrigin>` also prepares the runtime first. Origins remain required; the remote acceptance entry configures them automatically from its verified ready file. This installer does not grant usage consent, bind an account or trust hooks. Users explicitly review hooks and agree, and may withdraw at any time. The first-session notice uses the actual fixed Node path. Installation is separate from recording, upload, attribution and scoring.

The suite receipt declares `runtime.bootstrap` (path, exact nodeVersion, official downloadOrigin and supported platforms) and hashes the launcher with the remaining payload. The bootstrap file may be used by the remote entry before Node exists; it contains no executable runtime. Nothing in this source change publishes a package or updates an already installed market artifact.

MCP 与 hooks 的路径规则不同：Claude MCP 由宿主展开独立参数 `${CLAUDE_PLUGIN_ROOT}`；Codex 0.163 不展开它，按已声明 `cwd: "."` 在插件根运行。MCP shell 用单独位置参数接收路径，明确识别该未展开占位符时才用插件 cwd；绝对路径、含空格/引号路径不进入 shell 代码。缺公开启动器时具名 `HANAMESH_PLUGIN_ROOT_REQUIRED`，非法参数具名拒绝，不扫描目录或选择 PATH Node。
