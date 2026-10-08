# hanamesh-usage · 0.2.0-rc.16

> rc.13 消费公开 `client-page/opened` 并映射 open：核 canonical package、当前 Plugin Inventory 的启用/active 状态，以及 profile-installed、enabled、removable bundle 的实际所属 row；缺少这些公开服务或身份不一致时不采集。以 Host operationId 幂等，内置平台页及平台代生成的配置页不算普通插件。沿用 rc.12 succeeded→use；页面内按钮不自动算 use。组件与正式 GUI/真实 Core 服务端产品门分别记录。

> rc.12 在 Host 订阅公开 `commands/operation`：仅把 `succeeded` 映射为 `use`，经真实 Loader entry、owning base URL 与 `pluginPackages.packageOf()` 核 canonical manifest；以 commandId + phase 去重。`entered` 不证明 GUI open，因此不会生成 open。此为私有候选，真实 GUI、生产服务组合和 open 生命周期仍需独立门。没有新增依赖或浏览器写接口。

> rc.10 对齐官方 `@deepseek-ai/dsh@0.2.0-rc.2` 与 Cordis `4.0.4` 的公开 peer 闭包。沿用 rc.7 的事件字段、签名和存储格式；新宿主的 `agent/created` 回调按公开类型返回 `undefined`。rc.9 跳过官方 Loader 中不可安全记录的条目；rc.10 将 16 字节随机事件 nonce 加上字母前缀，使其满足服务端 token 首字符规则并保留 128 位随机熵。本卡的公开安装与真实运行时结果见 BlueMap `NPM-USAGE-01/REPORT.md`；组件门不等于产品 ACCEPTED。

`hanamesh-usage` 保留本机 `Declaration` 三态使用摘要，并提供同意门、设备签名、事件缓冲与服务器上报。生产路径只保存结构化最小信息，不保存 prompt、对话、文件、完整结果、私有路径或凭据。

## 安装

`hanamesh-usage` 是一个 DSH bundle（`package.json` 声明 `dsh.bundle.patch`）：

    dsh plugin --profile <p> add hanamesh-usage

装完即激活，不需要手写 `cordis.patch.yml`。`hanamesh-core` 与本包各只插入自己的 Loader 条目；新客户端负责分别安装三插件。本包不从 Core 传递安装，也不导入其他 HanaMesh 插件。

**依赖：** 设备身份与同意开关来自 `hanamesh-core`（可选）。core 缺席时本插件只在本机记录、不上报，`/api/hanamesh/usage/health` 显示 `core: 'absent'`。

**从 rc.3（`@hanamesh/dsh-activity`）升级：** storage-domain 由 `hanamesh_activity` 改为 `hanamesh_usage`，旧记录不迁入、不删除；需要保留请先在 rc.3 上 `POST /api/hanamesh/activity/export` 导出。

首次 Loader 扫描会把当前已装插件记为 `install`，`occurredAt` 使用扫描时刻；这是 Adoption 弱证据。宿主没有更强的实时 install/uninstall 事件，本版只做跨启动快照比较。

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

开发小界面（不进包）：`tools/int/` 是 P04 整合卡首段的装配与试用入口——`host.mjs` 起本卡自己的
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
