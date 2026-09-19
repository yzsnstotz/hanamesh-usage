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
| U11 | PASS | SOURCE+FIXTURE | core 缺席/不兼容时 apply 路径仍记录本地 Declaration，health 如实为 absent/incompatible；`internal/service` 晚上线后补签 pending 并按当前 consent 启动。P1 尚未登记交付，契约副本标 `standin:true`。 |
| U12 | PASS | FIXTURE+STANDIN | canonical 6 键经 standin Ed25519 签名，64 字节 base64url；公钥验签成功，篡改单键失败；历史空签 pending 一次发布补签。 |
| U13 | PASS | STUB | accepted/duplicates/rejected 三类原子落为 sent/duplicate/rejected；`pending-host-commit` 也终态；loopback smoke 首批 accepted 3。 |
| U14 | PASS | STUB+FIXTURE | 401/403 与 5xx 保持 pending、attempts+1、仅有界错误码；64 KiB 超限对半缩批；origin null 零请求；401→sent mutation 被 `ERR_ASSERTION` 杀死。 |
| U15 | PASS | STUB+FIXTURE | 撤回先一次本地清空再 DELETE；失败可重试，成功后不再发送；offline 只清本地；reverse-order mutation 被 `ERR_ASSERTION` 杀死。最终 REAL_HOST SIGKILL 仍待阶段 4。 |
| U16 | PASS | STUB+FIXTURE | withheld 下连续 5 次触发仍零 POST；忽略同意门 mutation 被 `ERR_ASSERTION` 杀死；loopback smoke withheld 阶段 posts 0。 |
| U17 | PASS | FIXTURE | health 顶层 10 字段、outbox 8 字段与四类 derive skipped 均按定稿形状出现。 |
| U18 | PASS | SOURCE+STUB | `src/`/`lib/` 无 legacy `producer`；远端合成 secret 响应不进入存储/health；上线正文每条恰 7 键。 |
| U19 | PASS | FIXTURE | Loader 首扫 install、稳定重扫零事件、升级 install、移除 uninstall、disabled 变化零事件；坏 entry 单独跳过并记有界码；先 withheld 扫描后授权会补发当前安装且只一次。 |
| U20 | PARTIAL | SOURCE+FIXTURE | spike 首行结论为 `loader`；钉版宿主候选只投影 Loader，缺版本、未加载依赖、历史和动作事件。隔离 profile 返回形状与 add/remove 行为待阶段 4 REAL_HOST，未冒充已跑。 |
| U21 | PARTIAL | SOURCE | `inject` 精确加入 `loader`，health 如实给出 loader service/method；真实 profile 首扫须在阶段 4 证明包含 usage、core/standin 与 DSH 内建插件。 |
| U22 | PARTIAL | SOURCE+FIXTURE | `EventStore.updateInventory()` 在唯一 `global.set` 中同时发布 `inventory.last` 与派生事件，consistency fact 已登记；REAL_HOST SIGKILL 留阶段 4。 |

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

## 阶段 2 原始结果摘要

- `npm run build && npm test`：目标工具链语义构建通过；91 tests，91 pass，0 fail。
- `npm run test:mutations`：7/7 killed，全部由 `ERR_ASSERTION` 杀死；新增撤回反序、401 错标 sent、withheld 仍上传三条。
- loopback `server-stub` + 内存 Ed25519 STANDIN：withheld POST 0；granted 首批 accepted 3 / 每条 7 键；重放 duplicates 3；撤回 DELETE 1；再次撤回仍 DELETE 1。原始五行见 `p2-2026-09-19/stage2-upload-smoke.jsonl`。
- `npm run check`：contract SHA-256 固定、standin 标记为真、consistency 2 groups / 3 boundaries、`producer` 0、出站 fetch 只在 `src/host/upload.js`。

## 阶段 3 原始结果摘要

- inventory spike 当前结论：`loader`；宿主 `pluginInventory.list()` 只是 Loader 的远程投影，不提供版本、未加载依赖、历史或 install/uninstall 事件；真实返回形状明确留阶段 4。
- `npm run build && npm test`：目标工具链语义构建通过；阶段接入后 96 tests 全通过（最终阶段 3 衔接数字以 raw 输出为准）。
- `inventory.last` 与同次扫描派生事件由 `EventStore.updateInventory()` 一次发布；consistency events group 已加入 `inventory.last:present`。
- 第 8 条 mutation 把 uninstall 的确定性键改成 install 键，专门身份断言必须以 `ERR_ASSERTION` 杀死。

## 四字段 checkpoint

- 做了什么：阶段 3 完成 Loader/inspectPackage 清单、跨扫描 install/uninstall、同 unit 快照+事件发布、apply/config-update/interval/授权恢复扫描、inventory health、spike 与第 8 条 mutation。
- 下一步：阶段 4，在全新隔离 `DSH_HOME` 安装最终 tgz 与 core STANDIN，补 REAL_HOST/REAL_BROWSER/STUB 门、互斥演示、真实 SIGKILL、打包/tag/Git 收口。
- 什么还没验证：最终 tgz 的 REAL_HOST bundle 激活；U20/U21/U22 的 REAL_HOST 部分与 U23–U31；P1/O1 真件联调（当前明确为 STANDIN/STUB）；两个 unit 的 REAL_HOST X02、三条边界的最终 X03；PLAT。
- 新阻塞：无。阶段 4 的 REAL_CORE/REAL_SERVER 取决于 P1/O1 是否已有登记产物，缺席时按路线用 STANDIN/STUB，不阻断 STANDIN/STUB 交付。
