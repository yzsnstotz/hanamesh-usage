> 2026-10-16 · rc.32：兼容读取旧版随机 nonce 的历史事件，保持原 nonce/签名/终态；新建和上传仍按当前严格契约。无法按当前格式上传的旧 pending 记录仅改为具名本机拒绝，保留记录并说明再次使用插件产生新记录。升级无需删除 storage；修复真实历史配置中 Usage 加载失败。详见 docs/compatibility/legacy-nonce-upgrade-20261016.md。

# hanamesh-usage · 0.2.0-rc.31

rc.31 接受官方 DSH rc.2 与当前 alpha 的公开宿主 peer：DSH `>=0.2.0-rc.2 <0.3.0-0 || >=0.2.1-0 <0.3.0-0`，Cordis `>=4.0.4 <4.1.0-0 || >=4.0.5-alpha.1 <4.1.0-0`，zod `^4.5.4`。开发闭包仍精确锁定 DSH `0.2.1-alpha.2` / Cordis `4.0.5-alpha.1` / zod `4.6.5`，无 override。安装与页面归属兼容 rc.2 的公开 `installed/removable` 和 alpha 的显式 `availability`；显式 `missing` 不降级猜为已安装。范围准入不代表范围内每个版本已在真实 Desktop 验过，证据与尚未运行的门见 [rc.2 兼容报告](docs/compatibility/dsh-rc2-rc31.md)。

`Declaration.provenance.dshVersion` 保持既有含义：本包构建所依据的 DSH 版本（当前 `0.2.1-alpha.2`），不是运行中宿主版本的探测值。旧记录不重写。设置页不将该字段显示为当前宿主版本；完整查询/导出读到它时应按构建来源解释。本次不增加运行时版本探测或更改存储格式。

历史 rc.26 曾将宿主 peer 精确锁到项目批准的官方 `d743267388641bc76f17c45ce8b4c231aed1d32c`。rc.31 将可安装宿主范围与可复现开发闭包分开；不安装 api-contracts 或 HanaMesh 邻仓包。

本卡证据区分 SOURCE/FIXTURE/PACKAGE 与官方未打包 Electron 载体的默认 Desktop 插件安装、设置及限定存储回归。完整 U1、真实 Core+Server 组合、原生介质强杀、安装版 Desktop 和 owner 验收仍由原产品门负责。

> rc.24：发布 allowlist 排除只供行为测试导入的 lib/client/index.js；rc.23 的默认安装/宿主取证保持冻结。

> rc.23：Q67 默认 pnpm 冻结闭包和无开发合约的生产消费复核；Q61 具名本地保留期/默认查询与 bounded 读取诊断。旧 rc.22 候选和真实报告保留；本卡不替代 J2S2-USAGE-05 U1。

> rc.22：record 保留原事实时间，按稳定 eventId 派生事件 nonce，两个独立缓冲的同事实签名摘要一致。Core/C-USAGE 消费正式合约 v0.9.0；C-USAGE-LOCAL 的 occurredAt 必填细化交 J1S4-APIC-13 发布，详见 [提供方交件](docs/contracts/usage-local-q18.md)。本卡只有 SOURCE/FIXTURE 证据。

> rc.21 由 Usage 客户端经 Cordis `internal/get` 包住 `slots.register`，只包装 `main`、`settings.section`、`plugins.bundle.config`、`plugins.row.config` 四功能位。组件提交有内容的 DOM 后，经 Usage 自有 `hanameshUsagePages` Remote 的 `issue` / `presented` 报告；host 从 Loader 与 canonical manifest 解析包名，核 active Inventory 和 installed/enabled/removable bundle row。客户端不提交包名；一次性 256-bit 凭据绑定 Peer、Loader 身份和功能位，60 秒到期、限流、先消费再异步核验/写入，同意变化、Core 变更、Peer 退出和 Usage 关闭均撤销。凭据不落盘，事件只留其 SHA-256 幂等键。不再监听 fork 的 `client-page/opened`。StrictMode effect 重放只提交一次，未挂载和空 DOM 不报告；不自动把页面内按钮算 use。该机制不证明任意被攻陷客户端的渲染真实性。

> rc.20 由 Usage 在 Host 经 Cordis `internal/get` 包住 commands 注册：记录调用方 fiber 的 Loader entry，以实际执行的 handler 确认命令归属，配对原会话自己的 `command/run` 与 `command/done(success)`，产出同形 `succeeded` 事实供现有 `use` 消费逻辑处理。不再监听 fork 的 `commands/operation`，不改上游、不读取命令参数或结果正文。包身份仍经 Loader entry、owning base URL 与 `pluginPackages.packageOf()` 核 canonical manifest；以 commandId + phase 去重。命令成功不证明 GUI open。SOURCE/FIXTURE 与真实 Cordis 框架测试不代替真实宿主、GUI 或生产服务组合验收。

> rc.10 对齐官方 `@deepseek-ai/dsh@0.2.0-rc.2` 与 Cordis `4.0.4` 的公开 peer 闭包。沿用 rc.7 的事件字段、签名和存储格式；新宿主的 `agent/created` 回调按公开类型返回 `undefined`。rc.9 跳过官方 Loader 中不可安全记录的条目；rc.10 将 16 字节随机事件 nonce 加上字母前缀，使其满足服务端 token 首字符规则并保留 128 位随机熵。组件门不等于产品验收。

`hanamesh-usage` 保留本机 `Declaration` 三态使用摘要，并提供同意门、设备签名、事件缓冲与服务器上报。生产路径只保存结构化最小信息，不保存 prompt、对话、文件、完整结果、私有路径或凭据。

## 安装

`@hanamesh/usage` 是一个 DSH bundle（`package.json` 声明 `dsh.bundle.patch`）：

    dsh plugin --profile <p> add --save-exact '@hanamesh/usage@0.3.0-rc.11'

装完即激活，不需要手写 `cordis.patch.yml`。`hanamesh-core` 与本包各只插入自己的 Loader 条目；新客户端负责分别安装三插件。本包不从 Core 传递安装，也不导入其他 HanaMesh 插件。

**依赖：** 设备身份与同意开关来自 `hanamesh-core`（可选）。core 缺席时本插件只在本机记录、不上报，`/api/hanamesh/usage/health` 显示 `core: 'absent'`。

**从 rc.3（`@hanamesh/dsh-activity`）升级：** storage-domain 由 `hanamesh_activity` 改为 `hanamesh_usage`，旧记录不迁入、不删除；需要保留请先在 rc.3 上 `POST /api/hanamesh/activity/export` 导出。

首次 Plugin Manager 扫描会把当前 profile 自有插件记为 `install`，`occurredAt` 使用扫描时刻；这是 Adoption 弱证据。本版只做安装快照比较，不将 Loader 的整个平台条目当作用户安装。

## 本地接口

- `GET /api/hanamesh/usage`
- `GET /api/hanamesh/usage/view`
- `POST /api/hanamesh/usage/export`
- `GET /api/hanamesh/usage/health`
- `GET /api/hanamesh/usage/events`
- `GET /api/hanamesh/usage/panel`、`/panel/view`、`/panel/remote`（rc.16）

`ctx.hanameshUsage` 提供 `query`、`export`、`health`、`drain`、`reconcile`、`record`、`panel` 与 rc.16 的 `remote`。`record` 只接受其它 HanaMesh 插件投递的 `open` / `use`，安装与卸载由 Loader 观测产生。rc.7 起 `record` 还接受可选 `sourceHanaRef`（来源 Hana，npm 包名）、`targetRef`（目标应用 / 会话，≤160 的 `[A-Za-z0-9][A-Za-z0-9_.:-]*`）与只配 `use` 的 `receipt {providerId, model|null, count≥1}`；同一 `idempotencyKey` 再投递不同归因或回执得到 `rejected: EVENT_IDENTITY_CONFLICT`，不覆盖。

## 隐私与上报边界

- 未同意时不创建 UsageEvent，也不向 Server 上报；本机 Declaration 摘要仍可保留。
- 上线事件必含 `deviceId`、`hanaRef`、`action`、`occurredAt`、`eventId`、`nonce`、`signature` 七个键；rc.7 起 `sourceHanaRef`、`targetRef`、`receipt` 只在非 null 时随事件上线（服务端把它们纳入内容 digest，不纳入签名）。回执只有供应商 id、模型名和次数，没有 prompt、响应或凭据。
- 撤回先清本地事件缓冲，再调用 Server 删除接口；离线时只完成本地删除并保留可重试状态。
- `Declaration` 只留本机；它不会作为 summary 上传。

## 开发与验证

目标工具链：Node `24.13.1`、pnpm `10.33.0`、TypeScript `5.9.3`。仓内使用 npm lockfile；依赖安装前用独立 `npm_config_cache`。

```sh
export npm_config_cache=$(mktemp -d)
npm ci
npm run build
npm test
npm run test:mutations
npm run check
npm run test:detached
```

真实门必须使用全新隔离的 `DSH_HOME` 与随机端口；不得触碰 `~/.dsh` 或 `3080`。STUB/STANDIN 证据不能替代 REAL_SERVER/REAL_CORE。

## rc.16 · 本设备服务端记录读回（P04-USAGE-INT-01）

`remote()` 与认证路由 `GET /api/hanamesh/usage/panel/remote` 只读本设备在服务端的记录：
用 Core 的 `signRequest` 对服务端公开路由 `GET /v1/usage/me/devices/:deviceId/events`
签名（签名只含路径，不含查询串），窗口为「当前 +5 分钟」往前 90 天，按 `nextAfter` 翻页到底。
返回 `{state, deviceId, total, events[{eventId,hanaRef,action,occurredAt,receivedAt}], code, httpStatus, checkedAt}`。
服务端拒绝（401/403）、不可达、响应格式不对都是 `state:'unknown'` 且 `total:null`，没有服务端地址是
`offline`；只有服务端真的返回空列表才是 0。读回不写本机状态、不采集、不受同意开关影响（撤回后用它核对删除）。
路由只挂在 Connection 的认证 exact 注册表，只允许 GET、不接受任何查询参数。

开发小界面（不进包，保留原整合运行证据）：`tools/int/` 是历史 P04 整合卡首段的装配与试用入口——`host.mjs` 起本卡自己的
hanamesh-server rc.34 + 全新 PG，`setup.mjs` 用公开 CLI 把普通样本和本包装进全新 `DSH_HOME`，
`dev-entry.mjs` 在真实 DSH 宿主里提供醒目标注的测试 Core 并在 `http://127.0.0.1:48671/` 给出页面。

## rc.15 · Usage 开发小面板

正常安装本 bundle 后，自己的 `./client` 通过公开 `settings.section` 注册
「Usage 开发小面板」。入口：HanaMesh.app → Settings → Usage 开发小面板。
刷新只 GET 本包认证路由 `/api/hanamesh/usage/panel/view`；HTML 在无脚本、
无表单的 sandbox iframe 中显示。读取失败显示有界错误，不创建事件。
公开 `/api/hanamesh/usage/panel` 返回相同最小投影。

面板仅显示 Core 当前设备的事件，主体缺失或不匹配显示未知；设备缺失不显示
其他设备的缓存。事件保留插件、动作、ISO 时间和原 owning 来源/事实引用。
签名由当前设备公钥进行 Ed25519 校验，成功、无效、未知分别展示；上报沿用
真实 EventStore 状态，与签名独立。面板不输出 nonce 或原始签名。

默认不注入测试身份或接收端。显式 `panelTestSupply: {identity:true,receiver:true}`
只声明界面的测试供给标识，不修改任何身份、同意、签名、采集或上传行为。
两个标识只能是布尔值，字段缺失/未知字段均报 INVALID_CONFIG。
未标为测试的供给仍显示「真实性未知」，不冒充已验证的生产门。

构建复用已锁定 TypeScript 生成公开 lazy-CJS 客户端格式；React 从平台静态
module table 获取同一实例，`react@18.3.1` / `@types/react@18.3.1` 仅开发期
类型与组件测试使用，无新增生产 dependency、私有 peer/vendor 或新 bundler。
原 rc.13 的 page→open、成功 command→use、同意与原子幂等逻辑保持。
正式 Desktop 新安装、可见首步截图与 owner ACCEPTED 分别等待产品门证据。

## rc.17 · 发布源事件边界

事件 nonce 按 ServerUsage rc13 的 Token 合约校验，不把本插件的 16 字节随机数编码当成协议。自产 nonce 仍由原生成器保留 128 位随机性。`wireEvent` 仅接受 43 字符的 Identity 设备 ID，短 ID 的离线本地样本不能签名或进入上报批次。未新增依赖、未修改签名六字段、同意、队列或撤回逻辑。

开发时合约类型与一致性套件从已发布源 tag 正常安装：Core `#semver:^0.2.0-rc.55`、ServerUsage `#semver:^0.2.0-rc.14`。只使用 Core 的 `./contract` 类型及双方公开 suite；运行时仍通过 Cordis 的 `hanameshCore` 服务，不 import 邻插件业务模块。锁文件记录一次解析的 commit，manifest 保持范围引用。npm 的 0.x caret 上限是下一 minor，不能据此声称覆盖整个 major；rc 的选择以实际包管理解析回执为准。

工程安装使用正常 peer 解析：`npm install --ignore-scripts --strict-peer-deps`；冻结安装使用 `npm ci --ignore-scripts --strict-peer-deps`。本仓已去除旧 `legacy-peer-deps=true` 配置；必须同时核 `npm ls --all`，不能只以安装 exit0 宣称闭包齐全。

客户端必须在功能贡献者注册前加载 Usage；已注册的旧组件与绕过 `internal/get` 的注册不追补。客户端依赖宿主既有 `slots`、`remote`（Typert Gateway）服务；host pages Remote 只随既有 `typertGateway` 可用而安装，不注册 Connection、Registry 或会话。真实 Desktop 的 Loader 身份投影、归属/同意/撤回取证仍由 J2S2-USAGE-05 执行，本轮工程完成不等于 U1 通过。

## Q61 · 本地保留期、查询与故障配置

`eventRetentionDays` 默认 **90**（`DEFAULT_EVENT_RETENTION_DAYS`），只裁剪 `sent/duplicate/rejected`
且 `sentAt` 严格早于保留窗口的终态事件；pending 永不按年龄裁剪。正整数天数，乘以一天毫秒数须为
安全整数。`queryLimit` 默认 **100**（`DEFAULT_QUERY_LIMIT`），范围 1–1000；声明与事件查询共用，
调用者显式 `limit` 覆盖默认。`maxQueryLimit=1000` 是沿用的单次响应校验上限，不是总量限制；
分页继续沿原 offset/after。无 schema、迁移、签名、业务时间窗或默认值变更。

两项是 Cordis 插件 config，例如 `{eventRetentionDays:90,queryLimit:100}`，无效值报 `INVALID_CONFIG`。
Usage 开发小面板及 `panel().policy` 显示实际值；读取配置不会写入、采集或改变同意。
正式 C-USAGE-LOCAL `health()` 的闭合形状保持原样：`failures` 记录 code→count，
`inventory.available/lastScanAt` 表示最近扫描状态。读取失败不会记录原 Error 或包路径。
Inventory 暴露 `INVENTORY_FAILED/INVENTORY_ENTRY_UNREADABLE/INVENTORY_PACKAGE_*`；
命令归属暴露 `COMMAND_SOURCE_UNREADABLE/UNAVAILABLE/INVALID/OWNER_NOT_FOUND/OWNER_INVALID`；
页面核对读取失败为 `PAGE_SOURCE_UNREADABLE`。这些都是拒绝采集的原因，不是绕过归属的兜底。
服务端读回的 90 天/+5 分钟窗口仍是提供方协议窗口，与本地 `eventRetentionDays` 分开。

工具显式绑定卡片与运行目录（均不进生产包）：
`node tools/int/setup.mjs <desktop> <sample.tgz> <usage.tgz> --card J2S2-USAGE-08 --run <本卡隔离目录>`；
`tools/int/{host,final-host}.mjs <up|start|status>`、`dev-entry.mjs <desktop>`、
`final-{setup,boot}.mjs` 都要求同样 `--card/--run`。Python component runner：
`python3 tools/run-command-runtime.py <desktop> <sample.tgz> <node> --candidate <usage.tgz> --card <卡号> --run <隔离目录>`。
默认卡根为 `~/.cache/hanamesh-runs`；隔离 HOME 时显式设置 `HANAMESH_RUNS_ROOT` 指向授权的卡根。
卡根必须是独立 `.cache/hanamesh-runs`，不能位于 `.dsh` 内。路径必须在该卡内、属于当前 uid 且不经 symlink 越界；原 DSH_HOME 与 fresh profile 检查保留。
`live-check.py` 还需本卡 `state/OBSERVER_INPUTS.json` 指定 deviceId、两个 observerPort 和本卡 PG container，
不再默认指向原卡端口/设备/容器。历史 `final-setup` 供给仍冻结在原取证版本，不能把它当 rc.23 产品验收。

不安装任何 HanaMesh 合约包（含开发依赖）。C-CORE 用仓内 Ed25519 测试替身 `tests/fixtures/core-fake.mjs`；C-USAGE 服务端行为只对真实本地后端验证。
`npm run test:contract` 自带目标构建。
框架 peer 与 React 宿主外部供给沿用，独立声明消费需正常 TypeScript/Node/React 类型工具。
本模块无 ABI 生成器或链上接口，ABI/模板/签名广播门不在本卡范围。

## Claude Code / Codex · Usage rc.11 / Agent0.2.3组合候选

宿主允许执行后用带锁的独立后台进程准备本架构固定Node24.13.1官方tar.xz；入口立即返回，准备期不记录/不补录。MCP先返回具名RUNTIME_PREPARING及真实字节进度，就绪后自动交接Node并开始仅本机记录；不需setup/agree/connect。Codex安装不等于Trust，须本人通过原生审核入口允许hooks；Trust前不记录且无会话提示。网站一次同意并绑定后，经Core capability2直读提交审计/绑定事实才上传与补报；旧终端granted保留、不造网页审计。DSH原同意弹窗不变。

事实只含插件、功能、时间、成败、渠道，不保留对话、工具正文、文件或凭据；滚动30天，执行采集/后台时清除过期。两渠道各每天首个新主会话最多提醒一次，N/最早期限/7天/1天加强，不因提醒自动上传/绑定。安装说明与hm-setup提前说明原生禁用停止的入口；禁用不等于清理或远端撤回，无真实回调控件的表面不提供假清理/静音按钮。

独立插件从本仓正常目标构建及固定Core正常tgz物化：`node tools/package-agent.mjs <core.tgz> <新输出目录>`；不读邻仓源码、不安装DSH peers。source/payload及Node bootstrap、两个manifest/Skill由suite-receipt逐文件绑定。MCP仍只读hanamesh_status，维护用setup/withdraw不是普通开通步骤。详见[Agent说明](agent/README.md)。正常包内置api.hanamesh.com/market.hanamesh.com；本地/staging完整显式覆盖，测试不得请求正式服务。

已收录插件首次实际调用补install，稳定每设备/Hana一次、跨Claude/Codex去重；单装不用、ambiguous/outer-only/未收录不构成安装事实，成败不伪造。use独立；未知提交冻结字节不自动重放。NodeSQLite仅作进程互斥，不存事件或密钥；仅过滤其确切实验性提示，其他警告及错误保留，不用全局NODE_NO_WARNINGS。macOS arm64/x64启动器受控摘要固定，非本轮实测架构与真实UI明确NOT_RUN。

远程安装证明固定于调用的首次观察：当时内容未通过核验的事实，后来修复安装并重放同一调用也不能晋升或补出旧use/install；仅修复后的新调用可成为首次合格调用。30天补传适用于当时已核验、只是尚未收录的事实，不追认失败的安装证明。当时已核验的Pre仍可在精确身份不变时补齐晚到结果。此修复当前仅源码及定向检查；原rc.11/Agent0.2.3正常包未更新，完整门与新版本正常包待编排代建锁。

本候选仍需组合/独审与公开发行隐私文案专业审阅，不npm/部署；工程CLI/单元/正常包检查不冒真实模型、完整网站或owner验收。

## B17 normal package ownership

Usage supplies its own normal package (`npm run build`, then ordinary `npm pack`), manifest/exports/profile and pinned producer inputs. It consumes consent, device signing, session and server-origin facts only through Core's public Cordis contract; it does not start a suite source, discover archives, edit another plugin's settings, rewrite DSH profile/locks, install itself or add a client hook. Core owns the optional ordinary-lifecycle local package source and its own configuration; AppHost/Brand remain their own providers.

For isolated official-DSH verification use a new HOME/DSH_HOME/shared identity root and --user-data-dir with env -i, normal file:tgz installation and full Core config with serverOrigin:null, websiteOrigin:null, allowSystemBrowser:false. Keep consent withheld and run no model: installation/loading/settings visibility does not prove real upload, public npm availability, package preinstallation or owner acceptance. Static seed delivery and first-profile timing precede plugin activation and belong to coordinator PKG-SEEDS/PRE-PROFILE, not an upstream request.

The producer's normal target build/full/mutations/check, required offline detached semantic check and official CLI installation are different evidence gates. The detached check uses the locked cache with no sibling sources and explicitly is not a target-host build. Optional real-backend tests remain visibly skipped when their explicit isolated test origin is absent; they are not replaced by fixture acceptance. No Usage rc.34 is selected or published by this migration.

### Claude Skill results (Usage 0.3.0-rc.7 / Agent 0.1.4)

Claude `Skill` PostToolUse results with an explicit boolean `success` now retain that success or failure as the minimal usage result. Unknown outcomes remain unverified; `countUnconfirmedCalls` is unchanged. Existing error/exit-status handling and other tools/channels retain their prior behavior. Agent marketplaces consume the generated 0.1.4 payload; updating the npm package alone does not replace an already-installed agent plugin.

R3发布中断修复：完整固定摘要/二进制版本通过且非阻塞取得准备锁，才修复发布后遗留PREPARING并记录finishedAt；锁仍由准备者持有时不改状态，Node status与hook均按未就绪暂停采集。旧rc.9/Agent0.2.1原件保持冻结；此修复不赋予上传同意、不重开主动关闭、不回填准备空窗。
