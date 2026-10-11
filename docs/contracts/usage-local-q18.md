# C-USAGE-LOCAL · Q-18 提供方交件 / J1S4-APIC-13

提供方版本：Usage 0.2.0-rc.22，卡 J1S4-USAGE-02。只改本模块。
消费方 C-CORE / C-USAGE 锁正式 git tag v0.9.0，commit 42661e20b2048cd50b117299d6520badf77d4d08。
本说明与最小替身交给后续 J1S4-APIC-13 发布，尚未替换 v0.9.0 中的 C-USAGE-LOCAL。

## record 输入与结果

Cordis `hanameshUsage.record`，原 action 为 open/use。字段形状见 `src/host/contracts.d.ts`。

| 字段 | 规则 |
|---|---|
| hanaRef | 必填，有界 npm 包名，<=128 |
| action | 必填，open 或 use |
| sourcePlugin | 必填，来源稳定包名，<=128 |
| idempotencyKey | 必填，来源真实事实的稳定键，非空安全 token，<=160 |
| occurredAt | **必填**，原事实 UTC 毫秒 ISO 时间；过去 90 天至未来 5 分钟 |
| sourceHanaRef | 可选/null，有界 npm 包名 |
| targetRef | 可选/null，安全 token，<=160 |
| receipt | 可选/null，仅 use：{providerId,model:string|null,count:1..2147483647} |

返回：`{disposition:'recorded'|'duplicate',eventId}`、`{disposition:'withheld'}` 或
`{disposition:'rejected',code}`。现有错误码不增加：INVALID_RECORD_INPUT（含来源稳定键/原始时间缺口）、
DEVICE_UNAVAILABLE、EVENTS_CAPACITY_REACHED、EVENT_IDENTITY_CONFLICT、RECORD_FAILED。
同意门先于输入校验；无同意返回 withheld。Core 不可用时保留既有 withheld/health 观察，不重新绑定。
health 形状不变，含 core: present/absent/incompatible，类型见同文件；没有新字段。

## 发布变更请求

v0.9.0 的 C-USAGE-LOCAL 允许 occurredAt 缺省为 now。本卡按 Q-18 改为必填并返回现有
INVALID_RECORD_INPUT，防止两客户端把接收时刻当作原事实时刻。APIC-13 必须同步
RecordInput 的 required/schema/说明及缺时间负例和模拟；不能保留旧默认语义。
其余字段、结果和错误集合保持既有公开形状。下游应先消费 APIC-13 的正式 tag，再接此候选。

## 同一次的身份与 nonce

UUIDv5 公式仍为 `JSON.stringify([deviceId,sourcePlugin,idempotencyKey])`，原 namespace 不变。
同一 OS 用户、同一共享根时只消费 Core.getDeviceId/sign/signRequest；不读取、复制共享私钥或重绑。
事件 nonce 为 `n + base64url(SHA256(UTF8(JSON.stringify(['hanamesh-usage:seat-event-nonce:v1',eventId]))))`。
事件级 nonce 是唯一性 token，无随机性要求；同事实跨独立缓冲得到相同 nonce。
不同 eventId 不复用 nonce；HTTP x-hm-nonce/时间戳每次由 Core.signRequest 重新生成并签名。

同键改 action、occurredAt、hanaRef、归因或 receipt 都是 EVENT_IDENTITY_CONFLICT，不能合并。
服务端保留原规则：同 id/同摘要 duplicate；同 id/不同摘要 USAGE_EVENT_CONFLICT；不同 id
复用 nonce 为 USAGE_NONCE_REUSED。摘要包含事件 nonce 与可选字段、排除 signature。
本地已有事件重送上传原 payload/nonce，含丢失响应、重启情形；不迁移历史事件。
去重受服务端原始记录保留/撤回边界限制，不承诺永久去重。

命令示例稳定键 `command:<原commandId>:succeeded`，时间为成功事实源的原 occurredAt；
页面键是本次真实呈现的稳定凭据摘要，独立打开有不同凭据/键。
页面同意后的一次呈现由本地源赋予一次时间，之后投递须携带并保留它；record 本身不填 now。
两个独立执行/打开是不同事实，即使同页面或同时间也不得合并。
若来源不能提供相同真实事实的稳定键/原始时间，报输入缺口，不能用客户端名、接收时间猜测。

## 示例与最小替身

`test/fixtures/usage-local-q18.mjs` 提供 createUsageLocalQ18Fixture（record/health）与
createUsageLocalQ18Examples，复用本模块实际 provider + 合成 host/storage，不导入其他产品。
用例覆盖 recorded/duplicate/withheld/rejected、同键不同 receipt 冲突与缺原始时间。
`tests/shared-fact.test.mjs` 消费正式 C-CORE 共享身份 fixture 和 C-USAGE 最小替身：两独立缓冲
签名有效、相同事件摘要，首次 accepted / 第二次 duplicate；不同设备/键和冲突/nonce负例。
这些均为 SOURCE/FIXTURE，不是服务端、双客户端 UI、Core 文件系统或 owner ACCEPTED。
