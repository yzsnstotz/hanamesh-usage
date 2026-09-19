# `hanameshCore` 契约

> STANDIN SNAPSHOT — P1 尚未在 `STATUS.md` 登记交付；本文件按 P2 路线冻结的方法表建立，并与 2026-09-19 的 P1 工作树副本逐字段核对。P1 到货后必须重新复制、核对 SHA-256 并把 `dependencies.json.standin` 改为 `false`。

| 方法 | 签名 | 语义 | P2 是否依赖 |
|---|---|---|---|
| `protocolVersion` | `readonly '1'` | 契约版本；破坏性改动升 `'2'` 并 bump minor | 是 |
| `getDeviceId()` | `() => string` | 本机设备 id，`apply` 后立即可得，不依赖注册 | 是 |
| `getPublicKey()` | `() => string` | raw 32 字节 base64url | 否 |
| `sign(bytes)` | `(bytes: Uint8Array) => Uint8Array` | Ed25519 原始签名 64 字节；同步；私钥不出进程 | 是（事件签名） |
| `signRequest(input)` | `(input: {method: string; path: string; body: Uint8Array \| null}) => Promise<Record<'x-hm-device-id'\|'x-hm-timestamp'\|'x-hm-nonce'\|'x-hm-signature', string>>` | 设备鉴权四个头 | 是（上报/撤回） |
| `getConsent()` | `() => 'granted' \| 'withheld'` | 当前同意状态（本机真相） | 是 |
| `onConsentChange(listener)` | `(listener: (state, changedAt: string) => void) => () => void` | 订阅；返回取消函数；注册时不回放当前值 | 是 |
| `getSession()` | `() => SessionSnapshot` | 设备注册观察；可能陈旧，不是授权证明 | 是（只读展示） |
| `getServerOrigin()` | `() => string \| null` | 配置的 Server origin；null = 离线 | 是 |
| `getHealth()` | `() => HealthSnapshot` | 组件健康快照 | 否 |

契约明确不暴露私钥、PKCS8、token、cookie、nonce、传输实例或 storage-domain 写接口。
