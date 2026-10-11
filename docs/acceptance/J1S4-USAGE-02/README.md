# J1S4-USAGE-02 · 同一来源事实跨独立缓冲只计一次

结果：完成（SOURCE/FIXTURE 工程卡；真实服务端、双客户端 UI、owner ACCEPTED 未验收）
提交：运行目录 REPORT.md 记录最终本地 main SHA；本轮不 push、不发布。
基线：1693646；任务分支 task/J1S4-USAGE-02；候选 0.2.0-rc.22。

## 交付与依赖

正式 api-contracts v0.9.0 解引用 42661e20b2048cd50b117299d6520badf77d4d08，
含 APIC-12 的 Core 572d853 共享签名身份保证及 APIC-04 的 C-USAGE。
只消费合约，不 import 对端模块、不读共享私钥、不重新绑定、不改服务端。
原 UUIDv5 公式保持；record 按稳定 eventId 派生事件 nonce，同事实保留原时间和所有摘要字段。
重送上传原事件，HTTP 认证仍逐请求 signRequest。原始持久屏障与 single-domain 写顺序不改。

字段/错误/示例/最小替身见 docs/contracts/usage-local-q18.md 和
test/fixtures/usage-local-q18.mjs，交后续 J1S4-APIC-13 发布。
唯一提供方语义细化是 occurredAt 必填、缺省返回现有 INVALID_RECORD_INPUT；
v0.9.0 的 C-USAGE-LOCAL optional/default-now 尚未同步，明确列为发布变更请求。
不同执行/打开不启发式合并；不同来源键/设备独立，同键不同真实事实冲突。

## 新鲜实跑

新 mkdtemp 独立 DSH_HOME/profile/TMPDIR；Node 24.13.1 / pnpm 10.33.0 / TS 5.9.3。
没有运行模型或真实宿主，不碰 ~/.dsh/3080、远端数据库或资金。

| 指定门 | 结果 | 同份证据 |
|---|---|---|
| npm ci | exit 0，37 packages | raw/ci.log |
| npm run build | exit 0，TARGET_SEMANTIC_BUILD_COMPLETE | raw/build.log |
| npm test | exit 0，155/155，0 skipped | raw/test.log |
| npm run test:contract | exit 0，18/18，0 skipped | raw/contract.log |
| npm run check | exit 0，strict 及公开合约锁检查保留 | raw/check.log |
| npm run test:mutations | exit 0，17/17 均 ERR_ASSERTION，含 X03 与两项 Q18 | raw/mutations.log、raw/mutations/ |
| npm run test:detached | exit 0，离线独立锁定闭包（非宿主构建） | raw/detached.log |

红：raw/red.tap 仅规范化行末空白；原件在运行目录保留，摘要见 raw/red-receipt.json。两项 ERR_ASSERTION（跨客户端 nonce 不同、缺时间仍 recorded）。
绿：raw/green.log 专项 8/8。第一次 check 因注释使用被扫描禁词 producer 而失败，
raw/check-first.log 原样保留；改注释后最终完整门通过，未放宽扫描/编译/测试规则。

专项验证用真实 record/EventStore、正式 C-CORE/C-USAGE 合约内存 fixture：
同事实的两份独立事件签名均有效且 eventDigest 相同，accepted=1 后 duplicates=1、贡献=1；
丢回执/重启后 payload 不变、请求签名有效且 nonce/时间戳逐次新生成；
不同键与已注册不同设备 independent accepted，同键不同 action/时间/receipt 冲突，
同 id 改 nonce 与不同 id 复用 nonce 均保留服务端拒绝规则。
不是 SQL、服务端 HTTP hooks、Core 文件系统、真实双客户端 UI 或 owner 验收。

## 交件

运行目录保留以前 bundle/tgz/复现证据，新交付 bundle+tgz+SHA256SUMS 和
q18-verification.json；REPORT.md/CLEANUP.json 记录最终收据及保留策略。
learning 已写 USAGE-004；未写文档仓或共享 STATUS。
detached 本轮通过；以前 legacy-peer-deps 缺 peer 的独立工具缺陷仍归 USAGE-07，不反向阻塞本卡。

合并前只读审查发现公开声明直接引用 dev-only 合约的包装回归；已在上传响应边界消费
正式 C-USAGE 类型，公开存储 DTO 保持自包含。无 api-contracts 的真实 tgz 严格 TS
消费先复现 TS2307（raw/packed-types-red.log），重建后绿色证据为 raw/packed-types-green.log。

许可 · 来源 · 用途：api-contracts 0.9.0 / MIT / 正式 Git tag / C-CORE、C-USAGE 及本地合约；
Cordis 4.0.4、dsh-session 0.2.0-rc.2 / MIT / 锁定 npm（deepseek-ai/deepseek-harness）/
原插件与会话 D-3 dependency 用法不变；TypeScript 5.9.3 / Apache-2.0 / npm / 严格编译。
