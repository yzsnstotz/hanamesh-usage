# 缺少 TokenUsage 公开字段时，未知不能伪装成 reported 0

> 模块现名：`hanamesh-usage`；历史 learning ID 与文件名保留。
ID: ACTIVITY-002
模块/标签: MOD-11、activity、contracts/missing-values
状态: OBSERVED
证据类型: SOURCE / FIXTURE
适用范围: 本次 activity 派发附件；DSH 0.1.5-alpha.1；MOD-06 0.1.0-rc.2；Registry session turn/end 与 assistant/message
可见性: INTERNAL

## 问题或目标
公开 session 声明把 assistant/message.usage 指向 dsh-llm.TokenUsage，但附件未包含该类型的字段和累计/增量语义。可见 usage 对象不代表知道如何解释它。

## 复现／证据
`docs/contracts/host-api/dsh-session/types/types.d.ts` 包含 TokenUsage 引用；`../acceptance/raw/contract-inventory.log` 记录附件未找到声明定义。`src/core/project.ts` 两条分支为 usage_not_reported 和 usage_contract_missing。FIXTURE reported 0、reported 7、estimated 3 与 unavailable 的分列行为通过；T05 将 missing() 变为 reported 0，出现 ERR_ASSERTION。

## 原因与方案
依赖材料不完整，不是零用量。故真实采集适配保留 unavailable；没有写 inputTokens/input_tokens 或多个 fallback 来猜字段，也没有用 raw stream 重建计数。没有足够证据定义估算策略，故生产适配暂不输出 estimated。

## 修复／复用办法
由真实宿主回收补齐同版本 dsh-llm 公开契约，明确每条 assistant/message 的计量范围、重试与累计语义，再实现一个数值映射及真实样本测试；不改 DSH 产品 pin。ui-kit rc.3 也需真实锁定产物，不自行猜 export 名称。

## 防止重犯
`tests/core.test.mjs` 固定缺契约不推断数字；`tests/privacy.test.mjs` 禁止 prompt/files/full-result/路径/凭据字段流出；数值测试样本明确标 synthetic。未实现适配之前保留本 OBSERVED，不因测试通过升级成完整功能 VERIFIED。

## 来源与维护
FR-10 / AC-13 / MOD-19 §5；本轮 activity agent；最近观察 2026-09-13（Asia/Tokyo）。事件来源不变、脱敏规则 activity-summary-v1；拿到完整契约后的新结论须更新本条及验收矩阵。
