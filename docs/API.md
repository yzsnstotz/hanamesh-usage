# hanamesh-usage 0.2 API

状态：本地实现契约。`hanameshCore` 与 O1 真件尚未登记交付时，测试证据分别标 `STANDIN` 与 `STUB`，不能冒充真实联调。

## Cordis 服务

`ctx.hanameshUsage` 提供：

- `query(filter)` / `export(filter)`：读取本地 `Declaration`；export 默认关闭。
- `events({state?,limit?,after?})`：读取本机事件缓冲。
- `record({hanaRef,action,occurredAt?,idempotencyKey,sourcePlugin,sourceHanaRef?,targetRef?,receipt?})`：只接受 `open` / `use`，返回 `recorded | duplicate | withheld | rejected`。rc.7：`sourceHanaRef` 是来源 Hana（npm 包名规则同 `hanaRef`）；`targetRef` 是目标应用 / 会话引用（`^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$`）；`receipt` 是 `{providerId, model, count}`，只允许配 `action:'use'`，`providerId` ≤64、`model` 为 null 或 ≤128 的 `[A-Za-z0-9][A-Za-z0-9_.:/@+-]*`、`count` 为 1..2147483647 的整数。三者缺省 null。同一 `idempotencyKey` 带不同归因/回执 → `rejected` + `EVENT_IDENTITY_CONFLICT`。
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

本地 `UsageEvent` 保存确定性 `eventId`、首次生成后不再替换的 16 字节 base64url `nonce`、来源和上报状态。rc.7 起 `sourceHanaRef` / `targetRef` 是可选归因（缺省 `null`），`use` 事件可带 `receipt: {providerId, model|null, count}`（rc.6 及更早的本地事件没有 `receipt` 键，读取时视为 null，不迁移、不改写）。`source`、`sourcePlugin`、`evidenceRef`、`upload` 不会上线。

本地事件 JSON 形状（rc.7）：

```json
{"schemaVersion":1,"eventId":"<uuid v5>","deviceId":"…","hanaRef":"@hanamesh/app-vibe","action":"use","occurredAt":"2026-09-22T10:00:01.000Z","nonce":"<16B base64url>","signature":"<64B base64url>|null",
 "sourceHanaRef":null,"targetRef":"vibe","receipt":{"providerId":"deepseek","model":"deepseek-chat","count":12},
 "source":"seat","sourcePlugin":"@hanamesh/dsh-app-host","evidenceRef":"use:vibe:2026092210","upload":{"state":"pending","code":null,"attempts":0,"sentAt":null}}
```

上线每条必含 7 键，三个可选键只在非 null 时出现：

```text
deviceId, hanaRef, action, occurredAt, eventId, nonce, signature [, sourceHanaRef] [, targetRef] [, receipt]
```

设备签名覆盖固定顺序的 6 键 `{deviceId,hanaRef,action,occurredAt,eventId,nonce}`（O1 冻结契约；不含 `signature`，也不含三个可选键），以 `JSON.stringify` 编码，再由 `hanameshCore.sign()` 生成 64 字节 Ed25519 签名并编码为 base64url。服务端把可选键纳入内容 digest：同 `eventId` 改可选键是 `USAGE_EVENT_CONFLICT`。本地去重身份同样包含它们。

## 上报时序

1. 原始 DSH 终结日志先完成持久屏障与复读。
2. `Declaration` 以 `hanamesh_usage` 的一次 `global.set` 发布。
3. 仅当 core 在场、同意为 `granted`、设备 id 可用且 executor 为 `reported` 时，派生并签名事件；事件与 eventId/nonce 以 `hanamesh_usage_events` 的一次 `global.set` 发布。
4. 上报器只取已签名的 `pending`，每批不超过 `uploadBatchSize`、200 条和 64 KiB；超限对半缩批。
5. `POST {serverOrigin}/v1/usage/events`，body 为 1–200 项裸数组（每项 7 必备键 + 最多 3 个可选键）；请求四个设备鉴权头来自 `hanameshCore.signRequest`，并发送精确 `Origin`。
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
