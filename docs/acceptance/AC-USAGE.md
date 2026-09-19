# AC-USAGE · P2 hanamesh-usage 0.2.0-rc.1

状态上限：实施中。只有用户可以签 `ACCEPTED`。

证据约定：`SOURCE`/`FIXTURE` 不能替代 `REAL_HOST`、`REAL_BROWSER`、`REAL_SERVER`；`STANDIN`/`STUB` 必须原样标注。

| ID | 当前状态 | 证据 | 结果 |
|---|---|---|---|
| U01 | PASS | SOURCE | 包、插件、unit、服务键、路由、TS/JS 标识符、工具前缀已改为 usage；历史 learning ID 与升级说明中的旧名按路线保留。 |
| U02 | PASS | SOURCE+FIXTURE | runtime-registry 值依赖、peer/dev、vendor tgz 与契约副本已移除；无绑定的 session 仍生成 Declaration，executor 为 `unavailable(binding_unavailable)`。 |
| U03 | PASS | FIXTURE | `dshVersion` 改为任意非空记录值；`0.1.4` 快照通过，空值拒绝。 |
| U04 | PARTIAL | SOURCE+FIXTURE | bundle 声明、单条 patch、空 dependencies、无私有 peer、离线安装/构建、53/53、detached 均通过；最终 tgz 的隔离 DSH `plugin add` 与 `--dump-config` 延至阶段 4，避免同一 `0.2.0-rc.1` 被宿主消费后继续改字节。 |
| U05 | PASS | FIXTURE | `UsageEvent` 闭合校验；nonce 必须是规范的 16 字节 base64url；canonical JSON 只含 6 个签名字段；wire 恰 7 键；本地预留字段恒 null 且逐字段投影。 |
| U06 | PASS | FIXTURE | reported executor 派生 use；estimated/unavailable 不猜；endedAt 缺失回退 startedAt、两者皆缺则跳过；派生失败不回滚 Declaration；猜 hanaRef mutation 被 `ERR_ASSERTION` 杀死。 |
| U07 | PASS | FIXTURE | session/loader/seat 的 UUIDv5 确定性；重放 duplicate 不换 nonce；同 eventId 的事实冲突拒绝。 |
| U08 | PASS | FIXTURE+SIGKILL | pending 满容量不逐出；只裁剪 sent/duplicate/rejected 且 sentAt 超 90 天；事件与 eventId+nonce 以一次 `global.set` 发布；前后 SIGKILL fixture 只见全旧或全新。 |
| U09 | PASS | FIXTURE | `record()` 覆盖 withheld/recorded/duplicate/rejected；install 与缺 idempotencyKey 均拒绝；时间窗为过去 90 天至未来 5 分钟。 |
| U10 | PASS | FIXTURE | 精确 5 路由；`/view` 为无脚本双表服务端 HTML、CSP `default-src 'none'` 且转义；`/events` 逐字段 JSON 投影。 |

## 阶段 0 原始结果摘要

- Node `v24.13.1`，npm `11.8.0`，TypeScript `5.9.3`。
- `npm ci --offline --ignore-scripts --legacy-peer-deps`：24 packages，exit 0（隔离 cache 先联网预热，再离线复跑）。
- `npm run build:offline`：`OFFLINE_CORE_SEMANTIC_BUILD_COMPLETE`。
- `npm test`：53 tests，53 pass，0 fail。
- `npm run test:mutations`：2/2 killed，均为 `ERR_ASSERTION`。
- `npm run check`：bundleRows 1、siblingSourceImports 0。
- `npm run test:detached`：`DETACHED_CORE_BUILD_COMPLETE`。

## 阶段 1 原始结果摘要

- `npm run build:offline && npm test`：74 tests，74 pass，0 fail；包含两个 single-layout unit 的 POSIX SIGKILL fixture 与 Declaration→事件安全侧检查。
- `npm run test:mutations`：4/4 killed，均为 `ERR_ASSERTION`；新增「猜 unavailable executor」与「在来源/Declaration 之前派生」两条。
- `node tools/samples.mjs`：1 个合成事件，wire 恰 7 键；跳过计数 `executorUnavailable/timeUnavailable/consentWithheld/noDevice` 各 1。
- `node tests/fixtures/seat-smoke.mjs`：依次输出 withheld、recorded、duplicate、rejected(INVALID_RECORD_INPUT)。
- `npm run check`：consistency 2 groups / 2 boundaries；两个 store 各只有一个 `global.set` 发布点；production files 20；sibling imports 0。

## 四字段 checkpoint

- 做了什么：阶段 1 完成 6 字段本地事件/7 键 wire、确定性去重、第二 storage unit、Declaration 派生、record 席位、5 路由与双表 `/view`；补齐 2 groups/2 boundaries、四条 mutation 与合成证据。
- 下一步：阶段 2，接入 duck-typed `hanameshCore` 契约、设备签名、批量上报、撤回和完整 health。
- 什么还没验证：最终 tgz 的 REAL_HOST bundle 激活；U11–U31；两个 unit 的 REAL_HOST X02、三条边界的最终 X03；PLAT。
- 新阻塞：无。阶段 4 的 REAL_CORE/REAL_SERVER 取决于 P1/O1 是否已有登记产物，缺席时按路线用 STANDIN/STUB，不阻断实现。
