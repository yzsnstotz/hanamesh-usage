# P04-USAGE-01 · Usage 组件真实门回收（2026-10-02）

结论：冻结的 `hanamesh-usage@0.2.0-rc.10` 无产品源码缺陷需要修复。既有源码 HEAD `20e69c6e12765aa778b9a649da2f48fc96c5b0b2` 与 tgz SHA256 `c69c97a93eb5ad167b60a8ec0000a954e809f291879992b9eb24078d7756864e` 保持不变。本次只在 Usage origin 增加隔离真实门 harness 和证据；没有新增依赖、peer、vendor 或配置项。`P04-USAGE-01` 的有限组件门可判 **🧪 DELIVERED**，完整 P04 仍 **PARTIAL**。

固定环境为 Node `24.13.1`、独立 Colima profile `hanamesh-p04-usage`、`postgres:17.6-alpine` 摘要 `sha256:ef257d85f76e48da1c64832459b59fcaba1a4dac97bf5d7450c77753542eee94`、真实 Fastify + `@hanamesh/server-identity@0.2.0-rc.4` + `@hanamesh/server-usage@0.2.0-rc.4` HTTP 模块路由、独立空库与受限 runtime 角色。所有数据库目标均在该专用 profile；没有连接生产库、默认 Colima、用户 DSH profile、3080 或研究 runtime。被测 Codex 请求 0 次。

|门|实现者 v4|独立 validator v5|
|---|---|---|
|首次签名上传|原始事件 1 行，本地 `sent`|原始事件 1 行，本地 `sent`|
|同 `eventId` 重发|本地 `duplicate`，数据库仍 1 行|本地 `duplicate`，数据库仍 1 行|
|传输中断时撤回|本地队列先清为 0；远端仍 1 行，撤回 `pending`|同左|
|冷启自动重试|重开持久文件并经 rc.10 `mountUsage → attachCore` 自动 DELETE；远端 0，撤回记录 1，状态 `sent`|同左；另只读 SQL 核 `deleted_events=1`|
|同意保持 OFF|重新挂载后 outbox `stopped`，服务端 POST 增量 0|同左；本地 snapshot `events=0`、`attempts=2`|

原始证据：[harness](real-host.mjs) SHA256 `be0ad0bb8a436dead3b5ea164718f410ac8dc6ac535327af15cb5b68c972e601`；[实现者结果](implementer-result.json) SHA256 `a766652551362fc44ddbd38aca98e8201486b61fe2a41bf7bef79a2a4553f81f`；[独立结果](validator-result.json) SHA256 `25713108f07cebbf1ad026b2a9cc26b15860b9c10b943b0b58dcf2c85d613944`；[validator 原始只读数据库核查](validator-db-readonly.txt)和[结构化值](validator-db-readonly.json)；[Node24 单元测试](unit.tap) `117/117`、[consistency 检查](check.log)通过。独立 validator 先完成 SPEC 审查再用新库复跑 QUALITY，报告在 `/Users/yzliu/work/projects/hanamesh/_deliveries/p04-dispatch-20261002/P04-USAGE-01-VALIDATOR.md`，SHA256 `3878867aa440f34759be8a6cf86c637ce05547bd5e8d0e02e9cfb0aa546e33ae`。

保留一次 v3 RED：[原始结果](invalid-nonce-red.json)。harness 曾随机生成首字符 `_` 的 event nonce，真实服务端按既有契约返回 `USAGE_INPUT_INVALID`；修正测试输入后使用全新 v4/v5 库复验通过。该 RED 不是 Usage 源码缺陷，也未被抹除或冒称通过。

证据等级是 **REAL_MODULE_HTTP + REAL_DB + STANDIN_CORE_SIGNER + STANDIN_DSH_CONTEXT**。这里的 `REAL_HOST` 只表示真实进程承载真实模块 HTTP 路由；没有运行完整 `hanamesh-server` HOST、真实 Core/DSH profile 或 Mac 原生 UI。故不能代替 `P04.compose` 以固定完整组合从全新原生入口连续验证 P04-U01–U03；未形成用户亲跑动作清单，`ACCEPTED` 仍由用户决定。
