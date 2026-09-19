# hanamesh-usage 0.2 API

状态：本地实现契约。`hanameshCore` 与 O1 真件尚未登记交付时，测试证据分别标 `STANDIN` 与 `STUB`，不能冒充真实联调。

## Cordis 服务

`ctx.hanameshUsage` 提供：

- `query(filter)` / `export(filter)`：读取本地 `Declaration`；export 默认关闭。
- `events({state?,limit?,after?})`：读取本机事件缓冲。
- `record({hanaRef,action,occurredAt?,idempotencyKey,sourcePlugin})`：只接受 `open` / `use`，返回 `recorded | duplicate | withheld | rejected`。
- `health()`：返回本文下方的有界健康快照。
- `drain()` / `reconcile()`：测试、回收和关闭屏障。

## 已认证 HTTP 路由

这些路由只注册到 DSH Connection 的 exact-fetch registry，不直接暴露原始 WebServer。

| 方法 | 路径 | 响应 |
|---|---|---|
| `GET` | `/api/hanamesh/usage` | Declaration 查询结果与 health |
| `GET` | `/api/hanamesh/usage/view` | 无脚本、服务端渲染的 Declaration + 上报状态双表 |
| `POST` | `/api/hanamesh/usage/export` | 本地 Declaration 导出；需 `allowExport:true` |
| `GET` | `/api/hanamesh/usage/health` | `HealthSnapshot` |
| `GET` | `/api/hanamesh/usage/events?state&limit&after` | 逐字段重建的本地事件页 |

所有响应为 `cache-control: no-store`；HTML 使用 `content-security-policy: default-src 'none'` 且不含脚本。

## 事件模型

本地 `UsageEvent` 保存确定性 `eventId`、首次生成后不再替换的 16 字节 base64url `nonce`、来源和上报状态。`sourceHanaRef` / `targetRef` 当前恒为 `null`。它们以及 `source`、`sourcePlugin`、`evidenceRef`、`upload` 都不会上线。

上线每条恰 7 键：

```text
deviceId, hanaRef, action, occurredAt, eventId, nonce, signature
```

设备签名覆盖前 6 键（不含 `signature`）：键按 Unicode 码点升序、无空白，以 `JSON.stringify` 编码字符串，再由 `hanameshCore.sign()` 生成 64 字节 Ed25519 签名并编码为 base64url。

## 上报时序

1. 原始 DSH 终结日志先完成持久屏障与复读。
2. `Declaration` 以 `hanamesh_usage` 的一次 `global.set` 发布。
3. 仅当 core 在场、同意为 `granted`、设备 id 可用且 executor 为 `reported` 时，派生并签名事件；事件与 eventId/nonce 以 `hanamesh_usage_events` 的一次 `global.set` 发布。
4. 上报器只取已签名的 `pending`，每批不超过 `uploadBatchSize`、200 条和 64 KiB；超限对半缩批。
5. `POST {serverOrigin}/v1/usage/events`，body 为 `{events:[<7-key event>]}`；请求四个设备鉴权头来自 `hanameshCore.signRequest`，并发送精确 `Origin`。
6. 2xx 的 `accepted`、`duplicates` 与 `rejected[{eventId,code}]` 转为本地终态；`pending-host-commit` 也视为远端已接收。401/403、5xx 与网络错误保持 pending、增加 attempts 并进入 1/2/4/8/15 分钟退避。

O1 当前用计数返回 `accepted` / `duplicates`，没有逐条成功 id；客户端按请求顺序把未 rejected 的前 `accepted` 条记为 sent、其余记为 duplicate。P1/O1 真件联调时若契约补充逐条 id，只在上报适配层调整。

## 撤回时序

1. `onConsentChange('withheld')` 停止普通上报。
2. 一次本地 `global.set` 先清空所有事件并写入 pending 撤回记录。
3. 若 origin 存在，发送签名的 `DELETE /v1/usage/me/devices/:deviceId/events`；失败只在“本地已空”的安全侧重试，成功后状态为 sent 且不再发送。
4. origin 为 null 时只清本地，状态为 offline。
5. 后续 `granted` 清除当前撤回状态并重新启动上报。

## HealthSnapshot

| 字段 | 语义 |
|---|---|
| `pending`, `recoveryComplete`, `failures` | 本地 Declaration 观察队列与有界诊断 |
| `consent` | `granted \| withheld \| unknown`；core 缺席为 unknown |
| `core` | `present \| absent \| incompatible` |
| `deviceId` | 当前设备 id；不可得为 null |
| `outbox.state` | `idle \| uploading \| backoff \| offline \| stopped` |
| `outbox.pending/sent/duplicate/rejected` | 本地缓冲各状态计数 |
| `outbox.lastUploadAt/nextAttemptAt/lastError` | ISO 时间或有界错误码，不含响应体 |
| `derive.skipped.*` | consent、executor、time、device 四类诚实跳过计数 |
| `withdrawal` | 当前撤回的 state、requestedAt、deletedEvents、attempts、lastError，或 null |
| `inventory` | 阶段 3 的可用性、来源与最近扫描时间 |

## 有界错误码

`INVALID_FILTER`、`EXPORT_DISABLED`、`USAGE_UNAVAILABLE`、`INVALID_RECORD_INPUT`、`DEVICE_UNAVAILABLE`、`EVENTS_CAPACITY_REACHED`、`EVENT_IDENTITY_CONFLICT`、`DERIVE_FAILED`、`CORE_SIGNATURE_INVALID`、`UPLOAD_UNAUTHORIZED`、`UPLOAD_UNAVAILABLE`、`UPLOAD_RESPONSE_INVALID`、`WITHDRAW_UNAVAILABLE`。错误响应、远端响应体、自由文本、prompt、文件路径与凭据都不写入本地状态或日志。
