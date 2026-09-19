# AC-USAGE · P2 hanamesh-usage 0.2.0-rc.4

状态上限：🧪 `DELIVERED` 候选；不是 `ACCEPTED`。只有用户可以签 `ACCEPTED`。

证据约定：`SOURCE`/`FIXTURE` 不能替代 `REAL_HOST`、`REAL_BROWSER`、`REAL_SERVER`；`STANDIN`/`STUB` 必须原样标注。

| ID | 当前状态 | 证据 | 结果 |
|---|---|---|---|
| U01 | PASS | SOURCE | 包、插件、unit、服务键、路由、TS/JS 标识符、工具前缀已改为 usage；历史 learning ID 与升级说明中的旧名按路线保留。 |
| U02 | PASS | SOURCE+FIXTURE | runtime-registry 值依赖、peer/dev、vendor tgz 与契约副本已移除；无绑定的 session 仍生成 Declaration，executor 为 `unavailable(binding_unavailable)`。 |
| U03 | PASS | FIXTURE | `dshVersion` 改为任意非空记录值；`0.1.4` 快照通过，空值拒绝。 |
| U04 | PASS | SOURCE+FIXTURE+REAL_HOST | bundle 声明、单条 patch、空 dependencies、无私有 peer、离线安装/构建与 detached 均通过。rc.1–rc.3 被消费后分别因可选服务访问、README 逐字、库存终态裁剪作废；最终 rc.4 在全新 HOME 重装、启动并通过。 |
| U05 | PASS | FIXTURE | `UsageEvent` 闭合校验；nonce 必须是规范的 16 字节 base64url；canonical JSON 只含 6 个签名字段；wire 恰 7 键；本地预留字段恒 null 且逐字段投影。 |
| U06 | PASS | FIXTURE | reported executor 派生 use；estimated/unavailable 不猜；endedAt 缺失回退 startedAt、两者皆缺则跳过；派生失败不回滚 Declaration；猜 hanaRef mutation 被 `ERR_ASSERTION` 杀死。 |
| U07 | PASS | FIXTURE | session/loader/seat 的 UUIDv5 确定性；重放 duplicate 不换 nonce；同 eventId 的事实冲突拒绝。 |
| U08 | PASS | FIXTURE+SIGKILL | pending 满容量不逐出；只裁剪 sent/duplicate/rejected 且 sentAt 超 90 天；稳定 inventory 重扫不会复活过期终态；事件与 eventId+nonce 以一次 `global.set` 发布；前后 SIGKILL fixture 只见全旧或全新。 |
| U09 | PASS | FIXTURE | `record()` 覆盖 withheld/recorded/duplicate/rejected；install 与缺 idempotencyKey 均拒绝；时间窗为过去 90 天至未来 5 分钟。 |
| U10 | PASS | FIXTURE | 精确 5 路由；`/view` 为无脚本双表服务端 HTML、CSP `default-src 'none'` 且转义；`/events` 逐字段 JSON 投影。 |
| U11 | PASS | SOURCE+FIXTURE | core 缺席/不兼容时 apply 路径仍记录本地 Declaration，health 如实为 absent/incompatible；`internal/service` 晚上线后补签 pending 并按当前 consent 启动。P1 尚未登记交付，契约副本标 `standin:true`。 |
| U12 | PASS | FIXTURE+STANDIN | canonical 6 键经 standin Ed25519 签名，64 字节 base64url；公钥验签成功，篡改单键失败；历史空签 pending 一次发布补签。 |
| U13 | PASS | STUB | accepted/duplicates/rejected 三类原子落为 sent/duplicate/rejected；`pending-host-commit` 也终态；loopback smoke 首批 accepted 3。 |
| U14 | PASS | STUB+FIXTURE | 401/403 与 5xx 保持 pending、attempts+1、仅有界错误码；64 KiB 超限对半缩批；origin null 零请求；401→sent mutation 被 `ERR_ASSERTION` 杀死。 |
| U15 | PASS | STUB+FIXTURE+REAL_HOST | 撤回先一次本地清空再 DELETE；失败可重试，成功后不再发送；offline 只清本地；reverse-order mutation 被 `ERR_ASSERTION` 杀死。真实宿主撤回后 pending 0、DELETE 恰一次、withdrawal sent。 |
| U16 | PASS | STUB+FIXTURE | withheld 下连续 5 次触发仍零 POST；忽略同意门 mutation 被 `ERR_ASSERTION` 杀死；loopback smoke withheld 阶段 posts 0。 |
| U17 | PASS | FIXTURE | health 顶层 10 字段、outbox 8 字段与四类 derive skipped 均按定稿形状出现。 |
| U18 | PASS | SOURCE+STUB | `src/`/`lib/` 无 legacy `producer`；远端合成 secret 响应不进入存储/health；上线正文每条恰 7 键。 |
| U19 | PASS | FIXTURE | Loader 首扫 install、稳定重扫零事件、升级 install、移除 uninstall、disabled 变化零事件；坏 entry 单独跳过并记有界码；先 withheld 扫描后授权会补发当前安装且只一次。 |
| U20 | PASS | SOURCE+FIXTURE+REAL_HOST | spike 结论为 `loader`；真实 `pluginInventory.list()` 只有 `entries/agentPresets`，entry 只有 enabled/entryId/fiberPhase/moduleName，缺版本、未加载依赖、历史和动作事件。原始形状见 `p2-2026-09-19/U20-inventory-probe.json`。 |
| U21 | PASS | SOURCE+REAL_HOST | `inject` 精确加入 `loader`，health 为 loader；最终 rc.4 首扫 153 项，含 usage、core-standin 与 151 个 `@deepseek-ai/*` 项。4 个不可读 entry 被单独跳过并记有界码。 |
| U22 | PASS | SOURCE+FIXTURE+REAL_HOST+SIGKILL | `EventStore.updateInventory()` 在唯一 `global.set` 中同时发布 `inventory.last` 与派生事件；真实写入窗口 SIGKILL 后仍为可解析旧完整镜像，重启成功。 |
| U23 | PASS | REAL_HOST+STANDIN | 全新隔离 HOME 依次 `plugin add` rc.4 usage 与 core-standin；两者都是 bundle，日志没有 `declares no dsh.bundle`；原始 dump-config 各一条，无手写 insert。 |
| U24 | PASS | REAL_HOST+STANDIN | DSH 0.1.5-alpha.1 启动成功；health 初值 pending 0 / recovery true / consent withheld / core present / inventory loader。 |
| U25 | BLOCKED | REAL_BROWSER | session Browser 到达新会话 UI，但隔离 profile 无模型 key，未发送消息、未伪造 Declaration；这是唯一模型 key 阻塞项。 |
| U26 | PASS | REAL_HOST+STUB | withheld 后等待超过两轮 5 秒间隔：POST 0、events 0。 |
| U27 | PASS | REAL_HOST+STUB+STANDIN | granted 后 1 个 POST 上报 152 个首扫 install；每条精确 7 键，无用户绝对路径、`sk-` 或自由文本。两个合法包名含单词 `prompt`，不等于 prompt 内容。 |
| U28 | PASS | REAL_HOST | 同 HOME 重启前后事件数均 152，eventId/nonce/state 摘要 digest 同为 `108be29f…0758`，没有膨胀；原始两个 unit 快照与 digest 文件均入仓。 |
| U29 | PASS | REAL_HOST+STUB+STANDIN | 撤回后 DELETE 恰 1 次、路径精确、pending 0、withdrawal sent、stub 回报 deletedEvents 152；原始 health 与 requests 入仓。 |
| U30 | PARTIAL | REAL_BROWSER+REAL_HOST | 已改用本 session 的 Codex in-app Browser；`/view` 的 Declaration 与上报状态两表可见，截图 `p2-2026-09-19/U30-view-session-browser.png`。events unit 存在；Declaration unit 因 U25 阻塞未产生。3080 是开工前既有 PID 1851，未触碰；并行 session 期间 `~/.dsh` 根目录 mtime 漂移，虽其 profiles/storages/凭据/设置文件 mtime 均未变，仍不声称严格 mtime PASS。 |
| U31 | PASS | REAL_HOST+STANDIN | rc.4 suite tgz 内嵌 usage、不含 checkout 绝对依赖；独立 HOME 先装 usage 再装 suite，启动以精确原文 `duplicate loader entry id: hanamesh-usage` 失败；remove 直接 usage 后配置只剩一条 usage + 一条 core-standin 并成功启动，记录数 0→0 保持。 |
| X01 | PASS | SOURCE+FIXTURE | consistency 合法：2 groups / 3 boundaries。 |
| X02 | PARTIAL | FIXTURE+REAL_HOST+SIGKILL | 两个 unit 的 POSIX fixture 均通过；真实介质已覆盖 `hanamesh_usage_events`，kill 前后 SHA 相同且重启成功。`hanamesh_usage` 因 U25 无 Declaration 未生成，真实 SIGKILL 未跑。 |
| X03 | PARTIAL | FIXTURE+REAL_HOST+SIGKILL | 三条反序/断点 mutation 均以 `ERR_ASSERTION` 变红；真实 SIGKILL 覆盖事件发布边界。Declaration→事件与撤回两个边界未各自完成真实 kill，不扩大结论。 |
| PLAT | NOT_RUN | — | 无本轮授权/可用的非 macOS `mayn` 执行通道。 |

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

## 阶段 4 原始结果摘要

- rc.1–rc.3 均已被真实 `plugin add` 消费后依 H-03 作废：依次修复可选 Cordis 服务访问、README 精确安装文案、稳定 inventory 重扫复活超 90 天终态。最终 rc.4 tgz SHA-256 为 `f8488b0797165b70cabf7542b4bb97b217bd547a62efbcf4e1499e0820d107a1`。
- 全新隔离 HOME 上 usage rc.4 与 core STANDIN 均作为 bundle 直接安装；DSH 0.1.5-alpha.1 health 为 `withheld/present/loader`，没有手写 insert。
- STUB 门：withheld 等待两轮零 POST；granted 后 1 POST / 152 个 install / 每条 7 键；重启事件数和 digest 不变；撤回 DELETE 恰一次、pending 0、withdrawal sent。
- REAL_BROWSER 已改为本 session 的 Codex in-app Browser，`/view` 两张表可见并截图。无模型 key，因此 U25 与 Declaration unit 的真实介质门保持 BLOCKED/PARTIAL。
- U31 在独立 HOME 复现精确重复 id 失败；移除直接 usage 后由 suite 继续激活，profile 恢复。
- REAL_HOST SIGKILL 已覆盖 `hanamesh_usage_events`：kill 前后旧镜像 SHA 相同、JSON 完整、同 HOME 重启成功；未把它冒充为两个 unit/三条 boundary 全覆盖。
- 最终门：Node `v24.13.1` / pnpm `10.33.0` / TypeScript `5.9.3`；99 tests / 99 pass / 0 fail；8/8 mutations 均由 `ERR_ASSERTION` 杀死；check 为 2 groups / 3 boundaries / bundleRows 1；detached PASS；终验后重打包与 artifact 逐字节相同。原始输出在 `p2-2026-09-19/final-*`。

## 四字段 checkpoint

- 做了什么：五阶段实现、真实 DSH bundle 安装/启动、STANDIN/STUB 上传与撤回、Loader inventory spike、session Browser 双表、U31 自包含互斥恢复、events unit 真实 SIGKILL、最终 rc.4 新 HOME 安装与浏览器复验均完成。
- 下一步：完成 Git main/tag/readiness 与 docs `STATUS.md` 登记；随后由用户决定何时用有模型 key 的隔离 profile 补 U25，并在 P1/O1 登记后分别补 REAL_CORE/REAL_SERVER。
- 什么还没验证：U25 真实模型会话与 `hanamesh_usage` Declaration unit 真实 SIGKILL；三条 boundary 各自的真实 kill；P1 REAL_CORE；O1 REAL_SERVER；非 macOS PLAT。
- 新阻塞：U25 无隔离模型 key；P1/O1 尚未登记到货；无 `mayn` 执行通道。其余实现与 STANDIN/STUB/REAL_HOST/REAL_BROWSER 门已按证据标签收口。

## rc.5 · O3 阶段 3（S06）真实 O1 宿主门暴露的契约缺口（本机 2026-09-20）

- 判定：rc.4 只对本仓 STUB 服务器验过上报。O3 S06 用真实 `hanamesh-server@0.2.0-rc.2` + 一次性 PG 跑 SI15 时，同意后 153 条待传全部 `UPLOAD_UNAVAILABLE`、sent 0。根因两处，均为本包与 O1 冻结契约（`hanamesh-server-usage/docs/API.md`）不一致：① 上传 body 用 `{events:[…]}` 信封，服务端只收 1–200 项裸数组（400 `USAGE_INPUT_INVALID`）；② 事件签名输入用「键按码点排序」的 canonicalJSON，服务端验签用固定顺序 `JSON.stringify({deviceId,hanaRef,action,occurredAt,eventId,nonce})`。
- 补齐：`src/core/canonical.ts` 新增 `signingJSON`（固定顺序六键）并用于 `signUsageEvent`；`src/host/upload.js` body 改为裸数组；`test/fixtures/server-stub.mjs` 与 U12/U13 测试改为服务端口径。`canonicalJSON` 保留给本地去重/摘要，不再用于签名。
- SOURCE：99/99、8/8 `ERR_ASSERTION` 突变、`check` 通过；tgz `hanamesh-usage-0.2.0-rc.5.tgz` SHA-256 `d0e66da926174e5bf8843a850601fdd39225bb69dd9e0da60ef67935ce2575b4`。
- REAL_SERVER：见 `hanamesh-core/docs/acceptance/suite-o3-20260920/stage3/`（core rc.12 + usage rc.5 复跑 S06）。

rc.5 上限 🧪，不是用户 ACCEPTED。
