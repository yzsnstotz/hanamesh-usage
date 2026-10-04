# hanamesh-usage · 0.2.0-rc.9

> rc.9 对齐官方 `@deepseek-ai/dsh@0.2.0-rc.2` 与 Cordis `4.0.4` 的公开 peer 闭包。沿用 rc.7 的事件字段、签名和存储格式；新宿主的 `agent/created` 回调按公开类型返回 `undefined`。rc.8 公开门发现官方 Loader 中有包名触发事件隐私校验，导致授权后整轮扫描中断；rc.9 跳过这类不可安全记录的条目，包括旧扫描快照中的条目，其他可记录事件继续处理。本卡的公开安装与真实运行时结果见 BlueMap `NPM-USAGE-01/REPORT.md`；组件门不等于产品 ACCEPTED。

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

`ctx.hanameshUsage` 提供 `query`、`export`、`health`、`drain`、`reconcile` 与 `record`。`record` 只接受其它 HanaMesh 插件投递的 `open` / `use`，安装与卸载由 Loader 观测产生。rc.7 起 `record` 还接受可选 `sourceHanaRef`（来源 Hana，npm 包名）、`targetRef`（目标应用 / 会话，≤160 的 `[A-Za-z0-9][A-Za-z0-9_.:-]*`）与只配 `use` 的 `receipt {providerId, model|null, count≥1}`；同一 `idempotencyKey` 再投递不同归因或回执得到 `rejected: EVENT_IDENTITY_CONFLICT`，不覆盖。

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
