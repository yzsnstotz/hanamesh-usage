# USAGE-004 · 稳定事件 id 还须稳定事件 nonce

ID: USAGE-004
模块/标签: usage、跨客户端、C-CORE、C-USAGE、幂等、签名
状态: VERIFIED（SOURCE/FIXTURE；真实服务端/双客户端 UI 未验收）
观察日期: 2026-10-11（Asia/Tokyo）

## 根因与处理

UUIDv5(deviceId,sourcePlugin,idempotencyKey) 相同不足以证明服务端 duplicate。
原 record 每次产生随机事件 nonce，EventStore 本地 identity 不含 nonce，因而本地合并
total=1 会掩盖服务端 eventDigest 含 nonce 的差异。两个独立缓冲各保留自己的随机值后，
服务端正确拒绝为 USAGE_EVENT_CONFLICT。事件级 nonce 必须按同一稳定事件身份确定；
HTTP 请求 nonce 则每次重新生成并签名，二者不能混用。

record 消费来源稳定键与原始 occurredAt；本地 now 只校验时钟窗口。
缺原事实时间返回 INVALID_RECORD_INPUT，不填接收时刻；两个独立执行/打开保持不同事实。
同 id 不同 action/时间/归因/回执仍冲突。提供方必填时间细化交 J1S4-APIC-13 发布，
不可把 v0.9.0 中旧 C-USAGE-LOCAL 的 optional/default-now 描述称作已同步。

消费 api-contracts v0.9.0（42661e20）已含 APIC-12 共享身份保证和 APIC-04 服务端摘要/nonce规则。
Core 归档 REPORT 缺席不能反推未实现；Usage 不读取共享文件/私钥或重新绑定设备。
升级 git tag 时 npm 曾仅更新根 spec、保留旧 lock resolved；须核锁中实际 commit 与安装版本，
不能只检查 package.json。本轮刷新对应 lock 节点后 npm ci 确认 0.9.0/42661e20。

## 验证与边界

两个真实 Usage record/EventStore、两个独立合约 Core service 对象共用合成签名身份，
验证两份事件签名与摘要，C-USAGE 最小模拟判首次 accepted / 第二次 duplicate。
丢失回执后重启缓冲重送保持事件 payload，HTTP auth 更新；不同键/设备被独立 accepted，
同 id 改事实/nonce 与不同事件复用 nonce 仍被拒绝。
新增随机事件 nonce 与缺时间填 now 两个变异都被 ERR_ASSERTION 杀死。
本轮 155/155 runtime、18/18 contract、17/17 mutation 与目标构建/check 通过。
原始证据见 docs/acceptance/J1S4-USAGE-02 与卡片运行目录；不升级为 REAL_SERVER/REAL_UI 或 ACCEPTED。

公开声明不可泄漏 dev-only 合约 import；协议消费类型放在私有上传边界，公开本地存储 DTO
自包含。严格检查真实 tgz 时复制锁定 peer 产物并排除 api-contracts，红 TS2307 后重建绿；
仓内及 detached 的 dev 安装闭包无法发现这一消费缺陷。
