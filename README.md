# hanamesh-usage · 0.2.0-rc.1

> 状态：P2 实施中，尚未达到 DELIVERED，更不是 ACCEPTED。目标宿主为 DSH `0.1.5-alpha.1`。收录不代表审核或推荐。

`hanamesh-usage` 保留本机 `Declaration` 三态使用摘要，并提供同意门、设备签名、事件缓冲与服务器上报。生产路径只保存结构化最小信息，不保存 prompt、对话、文件、完整结果、私有路径或凭据。

## 安装

`hanamesh-usage` 是一个 DSH bundle（`package.json` 声明 `dsh.bundle.patch`）：

    dsh plugin --profile <p> add hanamesh-usage

装完即激活，不需要手写 `cordis.patch.yml`。它是 **HanaMesh 套件**的一员：装 `hanamesh-core` 会一次带上本包与 `@hanamesh/dsh-app-host`，由 core 的 patch 统一激活。

**套件与单包互斥（双向）：**
- 已单独装过本包，再装 `hanamesh-core` → DSH 启动失败：`duplicate loader entry id: hanamesh-usage`。先 `dsh plugin --profile <p> remove hanamesh-usage`，再装 core；本机记录（storage-domain `hanamesh_usage`）不会丢，同一 profile 里重新激活后仍在。
- 已装套件（core），再显式 `add hanamesh-usage` → 同样 `duplicate loader entry id: hanamesh-usage`。撤销这次 `add`（`remove hanamesh-usage`）即恢复；套件里的 usage 不受影响。
- 这是 DSH 的既定行为（重复 loader id 让整个 profile 起不来），本插件不做静默去重；失败是响亮的，不会出现两份采集。

**依赖：** 设备身份与同意开关来自 `hanamesh-core`（可选）。core 缺席时插件保留本机摘要，但不创建或上报设备事件；`/api/hanamesh/usage/health` 会如实显示 core 状态。

**从 rc.3（旧 activity 包）升级：** storage-domain 由 `hanamesh_activity` 改为 `hanamesh_usage`，旧记录不迁入、不删除；需要保留请先在 rc.3 上 `POST /api/hanamesh/activity/export` 导出。

## 本地接口

- `GET /api/hanamesh/usage`
- `GET /api/hanamesh/usage/view`
- `POST /api/hanamesh/usage/export`
- `GET /api/hanamesh/usage/health`
- `GET /api/hanamesh/usage/events`

`ctx.hanameshUsage` 提供 `query`、`export`、`health`、`drain`、`reconcile` 与 `record`。`record` 只接受其它 HanaMesh 插件投递的 `open` / `use`，安装与卸载由 Loader 观测产生。

## 隐私与上报边界

- 未同意时不创建 UsageEvent，也不向 Server 上报；本机 Declaration 摘要仍可保留。
- 上线事件恰含 `deviceId`、`hanaRef`、`action`、`occurredAt`、`eventId`、`nonce`、`signature` 七个键。
- 撤回先清本地事件缓冲，再调用 Server 删除接口；离线时只完成本地删除并保留可重试状态。
- `Declaration` 只留本机；它不会作为 summary 上传。

## 开发与验证

目标工具链：Node `24.13.1`、pnpm `10.33.0`、TypeScript `5.9.3`。仓内使用 npm lockfile；依赖安装前用独立 `npm_config_cache`。

```sh
npm run build:offline
npm test
npm run test:mutations
npm run check
npm run test:detached
```

真实门必须使用全新隔离的 `DSH_HOME` 与随机端口；不得触碰 `~/.dsh` 或 `3080`。STUB/STANDIN 证据不能替代 REAL_SERVER/REAL_CORE。
