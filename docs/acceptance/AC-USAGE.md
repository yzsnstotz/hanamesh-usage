# AC-USAGE · P2 hanamesh-usage 0.2.0-rc.1

状态上限：实施中。只有用户可以签 `ACCEPTED`。

证据约定：`SOURCE`/`FIXTURE` 不能替代 `REAL_HOST`、`REAL_BROWSER`、`REAL_SERVER`；`STANDIN`/`STUB` 必须原样标注。

| ID | 当前状态 | 证据 | 结果 |
|---|---|---|---|
| U01 | PASS | SOURCE | 包、插件、unit、服务键、路由、TS/JS 标识符、工具前缀已改为 usage；历史 learning ID 与升级说明中的旧名按路线保留。 |
| U02 | PASS | SOURCE+FIXTURE | runtime-registry 值依赖、peer/dev、vendor tgz 与契约副本已移除；无绑定的 session 仍生成 Declaration，executor 为 `unavailable(binding_unavailable)`。 |
| U03 | PASS | FIXTURE | `dshVersion` 改为任意非空记录值；`0.1.4` 快照通过，空值拒绝。 |
| U04 | PARTIAL | SOURCE+FIXTURE | bundle 声明、单条 patch、空 dependencies、无私有 peer、离线安装/构建、53/53、detached 均通过；最终 tgz 的隔离 DSH `plugin add` 与 `--dump-config` 延至阶段 4，避免同一 `0.2.0-rc.1` 被宿主消费后继续改字节。 |

## 阶段 0 原始结果摘要

- Node `v24.13.1`，npm `11.8.0`，TypeScript `5.9.3`。
- `npm ci --offline --ignore-scripts --legacy-peer-deps`：24 packages，exit 0（隔离 cache 先联网预热，再离线复跑）。
- `npm run build:offline`：`OFFLINE_CORE_SEMANTIC_BUILD_COMPLETE`。
- `npm test`：53 tests，53 pass，0 fail。
- `npm run test:mutations`：2/2 killed，均为 `ERR_ASSERTION`。
- `npm run check`：bundleRows 1、siblingSourceImports 0。
- `npm run test:detached`：`DETACHED_CORE_BUILD_COMPLETE`。

## 四字段 checkpoint

- 做了什么：阶段 0 改名、bundle 化、runtime-registry 解耦、版本字面量门移除、MIT/repository 元数据、离线基线修复证据。
- 下一步：阶段 1，以失败测试定义 UsageEvent、确定性 eventId、EventStore、derive、record 与 `/events`/`/view`。
- 什么还没验证：最终 tgz 的 REAL_HOST bundle 激活；U05–U31；X02/X03 的 P2 新边界；PLAT。
- 新阻塞：无。阶段 4 的 REAL_CORE/REAL_SERVER 取决于 P1/O1 是否已有登记产物，缺席时按路线用 STANDIN/STUB，不阻断实现。
