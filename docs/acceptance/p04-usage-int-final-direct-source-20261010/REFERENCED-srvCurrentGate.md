# CONTRACT-SERVER-USAGE-MAJOR-COMPAT-01 REPORT — 完整 main 消费闭包 actual 已交

- **DELIVERED / NOT_TO_TEST / NOT_ACCEPTED**。本 origin 全范围消费收口与 Identity `0.3.0-rc.2` 适用 actual 门已齐，普通合入 main/private push，发布 Usage `v0.3.1-rc.1`；不等 Identity formal 或其他 consumer。本轮没有活动 BLOCKED。
- 唯一 writer：Codex `01a11f26-fc80-7f93-b57d-925c6bbdf880`，2026-10-09 JST；授权 `A-2026-10-09-CONTRACT-CONSUMER-MAIN-CLOSURE` 与同批 Identity 破坏性候选适配。
- 两问：只改 **hanamesh-server-usage**。Identity 是本 origin 已用的公开 Services/types/auth peer，按 owning 源实际 rc2 提升消费范围；Devkit 是原开发工具，只保合法 Git 子包 dev 引用，unused runtime peer/vendor 去除。没有新增 dependency 名称、peer、配置项、协议副本或邻仓补丁。
- 试用入口已起：无（内部源合约收口，owner 不测）；产品/本人/RPC/GUI/独立 VERIFY 未跑，旧接受范围不扩。

## fresh main、源供给与发布回读

| 项 | 实核事实 |
| --- | --- |
| source 起点 | fresh origin/main `feb7aa18a32f9a84f68e2bd87869b0fbdcf2c942`；原任务枝已吸收事实与旧 GATE 保留，非从旧失败枝当 main 重起 |
| 有效 Identity 候选 | 源 CARD/最新 REPORT 已读；`v0.3.0-rc.2` annotated object `70bfde057370aeca6016f02e5920fdcfd02039dd` → main/tag `93691f5cd863c1bc2ce8ed985197b774ed97e526`。源报告与 fresh refs 一致；rc1 漏 SQL 的失败供给不用、不覆盖 |
| Identity 正常包核对 | 126210B / 88成员 / SHA256 `bdd5b586a195d8ffa783f27642c89f523e077c778605b5598a93c1e3bb66bbc5`；root 与最终 Git consumer 实际安装的 88/88 成员逐字节相同，含 0004 SQL |
| 本方实现 | `57d198babf8c69e26ea727fe84c4f62ccc76cd30`；release manifest `1c6107b`，release receipt `3390794`；其中正常包 members 来源提交为57d198b |
| 普通 main merge | `24299fb8f8ed22edb3200b4871cc2f11041c0b61`，parents feb7aa18 + 3390794；原 main 为祖先，真实 `--no-ff`；atomic non-force private push |
| 当前任务枝 | `codex/contract-server-usage-main-closure-01` = main24299fb8；source任务树、main-integration、原primary均工作树干净 |
| 新候选 tag | `v0.3.1-rc.1` object `1a5eca5fbfa4b0113ebf19162d3bebc6f70d06bc` → 同 main24299fb8；未占号后正常创建推送。只增0.3线Z，不升Y，非公共release/npm publish |
| 本方正常包 | 84290B / 56成员 / SHA256 `1f7bbadac38cc560f5a3fe98e2c2cc438b15fe67aaf2d847f3a96de048fd116a`；真实 tag export 正常npm pack与已过 actual 候选完整tgz逐字节相同 |
| 旧供给保护 | 原 `v0.3.0-rc.1` object7aa46352→feb7aa18、正常包SHA580a8d8d及原GATE保；先前 PARTIAL、rc11 old-peer failure 与 mutation拷贝失败均原文保，不改成PASS |

本方正常供给：`git+https://github.com/yzsnstotz/hanamesh-server-usage.git#semver:^0.3.1-rc.1`。
包原件：`/Users/yzliu/.cache/hanamesh-runs/CONTRACT-SERVER-USAGE-MAJOR-COMPAT-01/identity-rc2-actual-20261009/candidate/hanamesh-server-usage-0.3.1-rc.1.tgz`。
发布源：[v0.3.1-rc.1](https://github.com/yzsnstotz/hanamesh-server-usage/tree/v0.3.1-rc.1)。本次源实际门原件在该 main 的 `docs/acceptance/contract-server-usage-major-compat-01/identity-rc2-actual-20261009/`；raw logs 用 gzip 无损保留，原 stdout 同时留 run。

## root / 全子包 / 直接传递消费矩阵

全活动 manifest 审计只有 root `package.json`，子包/modules/packages manifest **0**，一个正常 pnpm lock；files/scripts/vendor/生成配置均核。历史 docs acceptance manifest/artifacts 是原收据，非活动供给，不改旧字节。

| 项 | 当前 main owning 声明 / 实际解析 / 适用性 |
| --- | --- |
| Identity peer/dev | optional peer `^0.3.0-rc.2`，dev `git+https://github.com/yzsnstotz/hanamesh-server-identity.git#semver:^0.3.0-rc.2`；实际 package rc2 / commit93691f5c。full Services ABI、auth/device/principal、public types 全适用 |
| Devkit dev | `git+https://github.com/yzsnstotz/hanamesh-server-shared.git#semver:^0.2.0&path:/packages/devkit`；正常 pnpm10.33解析0.2.0/8f9bcc69。公开工具 consumer/CLI PASS，六 src/bin沿旧工具byte；本方src/dist零Devkit import，不需runtime peer |
| Devkit peer/optional/vendor | 已删无用 peer/meta 和两个tracked archives；rollback完整保在本卡run。Devkit自身无 runtime/private dependencies或peer；正常包与消费者不安装Devkit runtime |
| runtime 私有 deps | 无额外项。Identity来自同一源声明，不携合同副本；没有隐藏根别名/跨插件import/随包tgz。本方直接Identity之外无Claim/Registry依赖，彼两源候选不是本卡前件 |
| 其余 peer/dev | Fastify5.12.3、Drizzle0.45.2、pg8.23.0、TS5.9.3/types等原有效声明沿用；Identity内部SDK/依赖以正常rc2包真实闭包为准，不在本方override |
| 锁/生成器 | 包管理器正常生成lock；未手写resolved SHA，Git commit仅lock snapshot。source/header/type生成器直接使用本manifest peer/dev范围；无active私有file/vendor/workspace/commit说明符，peer同caret兼容线 |
| main实际回读 | fresh remote main/task/tag peeled同24299fb8，main package/lock含Identityrc2真实commit，activevendor无；原primary不切枝、不改旧环境 |

0.Y是caret兼容线已定；本方候选packageVersion=`0.3.1-rc.1`，自身contract.version=`0.3.0-rc.1`，协议token=`'1'`。协议、factory要求、schema/fixture/suite精确自一致与拒token2原行为保；没有跨包SemVer全值相等输入，**N/A**，不虚造握手或未知版本默认值。后文上一轮caret建议已失效，不作为OPEN决定。

## actual、类型、正常包门与 N/A

| 门 | 本轮结果与边界 |
| --- | --- |
| root全新正常 install / strict / frozen | **PASS**。移除本卡可再生旧failed node_modules后正常Git安装；frozen锁不漂移，strict始终开启；source图Identity/Devkit各1物理包 |
| 环境/build/check/preflight | **PASS**：Node24.13.1 / pnpm10.33.0 / TS5.9.3，真实已安装Identityrc2，unmet=[]；声明图strict含skipLibCheck=false，无ambient/强转 |
| tests | **175/175 PASS**。首次157/175因18项mutation-baseline旧复制清单仍含已删vendor；本origin只修该清单，第二次所有baseline守门照常测“原目标已有失败应阻止mutant”，不降assert或保空vendor |
| Devkit公开一致性 | **PASS**：正常Git0.2已安装公开exports/实际CLI与源checkConsumer；本次root strict闭包也已过。toolGate不冒产品门 |
| normal pack + installed JS/TS | **PASS**：56成员；无peer公开导入、missingIdentity fail-closed、正常installed public types及factory合法/错误类型向量；verify:release sourcecommit、manifest、lock、artifact、checksum与migration均过 |
| Usage consumer suite | **5/5 PASS**，正常包自带参考consumer向量；参考向量标签保，不冒真实本人 |
| Usage实际HTTP/package suite | **HTTP10/10、package7/7 PASS**：正常包安装 +真实Identityrc2 + Fastify +全新隔离PG，实际会话/设备注册绑定、签名/主体边界、读回、重放、撤回、hook503整体回滚等。实际auth/device/principal调用由本方公开服务执行 |
| Identity provider | **25/25 PASS**：正常安装rc2的公开provider CLI真实HTTP/PG；它随带reference consumer16仍**FIXTURE**，不冒本方actual |
| Identity Services full ABI | **56输入/58结果 PASS**，正常installed Usage实际factory + 实际受限PG preflight，8合法接受/48畸形拒绝且畸形0DB调用；源fixture由公开port获取。coverage `publicABI=true, actualInteractions=false, errorHandling=false`原标签保；业务actual见上独立HTTP/package，不把port fixture当实际行为 |
| errors矩阵 | 原 `NOT_CHECKED` 保，未新增32/future error presenter覆盖或假PASS |
| 最终Git tag消费者 | **PASS**：Usage `^0.3.1-rc.1` + Identity `^0.3.0-rc.2`真实Git安装、strict/frozen、public JS与严格TS（skipLibCheck=false）；56/56与88/88成员等已actual正常包。Usage/Identity各1物理realpath，peer软链重复路径不算第二包；Devkit runtime无 |
| 自身byte边界 | **78个src/dist/contract/migration文件全原byte**。正常包53成员同原正式包，仅package.json/README/Devkit许可记录3metadata成员变化，新增/删除0；新Git完整suite按56/88同byte引用本轮已过actual，不重跑同业务 |
| 钱包唯一性业务直接适用 | **N/A**：`src/service.ts`仅使用Identity authorize/authenticate、deviceAuth.authenticateDevice/getDevicePublicKey、principalLinks.resolveCanonical，src/dist无wallets.challenge/bind/listOwn/getBinding业务调用。`src/index.js`仍要求完整wallets ABI，公开类型/auth等**适用且已通过**；不称本人钱包/部署跨链409门由Usage已测 |

合约一致性：**@hanamesh/server-usage v0.3.1-rc.1 通过**（包内`./conformance`/本source `scripts/contract-conformance.mjs`，normal actual consumer5/HTTP10/package7；自身CONTRACT版本沿用0.3.0-rc.1）。
合约一致性：**@hanamesh/server-identity v0.3.0-rc.2 通过（本 origin 适用 fullABI/types/auth-device-principal）**（源公开`/contract`、`/contract/fixtures`、`/contract/ports`及正常provider CLI，本方 `scripts/identity-consumer-conformance.mjs`、`scripts/identity-port-types.ts`与实际Usage HTTP/package suites）。钱包新唯一性直接业务N/A，不伪造`runIdentityWalletUniquenessSuite`消费；其owning源实际门引用源REPORT。
合约一致性：**@hanamesh/devkit v0.2.0 通过**（正常Git子包公开`/contract` checkConsumer/CLI；root strict闭包）。

## 保护、原失败与交件

原工程阻塞已解除，旧BLOCKED原文仍在 `evidence/main-closure-20261009/BLOCKED-routed-original.md`，不重新激活。本次比较探针第一次在Git install未结束前看到缺文件，未产生PASS；等install/types全部exit0后逐成员核实。原path计数重复看同Identity peer软链，改以realpath核物理包并留原encounters；没有改安装/绕strict/塞第二版本。tag包首次从任务树pack的日志另保，最后在实际tag export重pack确认整tgz同byte。

全新tmpfs PG容器 `hm-srv-usage-identity-rc2-20261009`已删除，无新常驻产品进程；秘密仅随机内存实验环境，未记值/未落真实secret文件。CLEANUP全run一级与本次子项齐，源码/正常包/证据/rollback/活入口按声明保。docs只交本卡REPORT/CLEANUP/evidence；canonical其他并行dirty/index不动，不称共享整仓clean。

原MemoryPool UNIT/FIXTURE、Services false/NOT_CHECKED、产品/本人/GUI/RPC/平台CUA/独立VERIFY/owner接受仍原范围。**产品NOT_RUN、ownerNOT_ACCEPTED**；未接触~/.dsh、3080、研究runtime、现存DB、真实凭据/签名广播/资金、部署或公开发布。Identity正式0.3.0收件由PM协调，不是本方candidate actual收口前件；候选报告不称formal已发。

---

## 前次 PARTIAL 与旧交件（历史原文；当前状态以上文为准）

# CONTRACT-SERVER-USAGE-MAJOR-COMPAT-01 REPORT — origin/main 全消费收口

- 当前结论：**PARTIAL / NOT_TO_TEST / NOT_ACCEPTED**。可独立工程已私有推送任务枝；完整 root strict 安装被 Identity rc11 的旧 Devkit peer 阻断，Identity 0.3 候选 tag/源 REPORT 未供给。本轮不合 main、不发新 tag；原 main/tag/GATE 保留。
- writer：Codex `01a11f26-fc80-7f93-b57d-925c6bbdf880`；2026-10-09 JST；授权 `A-2026-10-09-CONTRACT-CONSUMER-MAIN-CLOSURE`。
- 两问：只改 **hanamesh-server-usage**，不在邻仓修补。Devkit 是本仓既有开发工具，runtime 不 import，故移除 unused optional peer；开发工具从其 owning shared 子包正常 Git 安装。Identity 是既有公开 Services/types 消费，候选未供给前不编造版本或替上游改包。无新增依赖名称、配置项、override 或随包 tgz。
- 试用入口：无；内部工程，不交 owner GUI 测试。

## fresh main 审计与本轮变更

起点 source origin/main `feb7aa18a32f9a84f68e2bd87869b0fbdcf2c942`。只有 root `package.json`，子包 manifest 0；一个 pnpm lock；files、scripts、runtime/peer/dev/optional 及 vendor 都已核。完整原件 `evidence/main-closure-20261009/main-audit-before.json`。

| 私有闭包 | 本轮 owning 声明与事实 |
| --- | --- |
| Identity | optional peer `^0.2.0-rc.11` + 匹配 dev Git `#semver:^0.2.0-rc.11`，仍为实际有供给的 rc11；解析 commit `17ba1181041b0b0789f7ffb6373c66e2abb34e77`。不是最终 0.3 适配完成 |
| Devkit | 删除 optional peer/meta 与 tracked vendor archives；dev 为 `git+https://github.com/yzsnstotz/hanamesh-server-shared.git#semver:^0.2.0&path:/packages/devkit`。实际 Devkit `0.2.0` / commit `8f9bcc69cbacf01d97ffe63bbbade4f865e6dd89`，自身 dependencies/peer 均无 |
| 外部 runtime peer/dev | Fastify `5.12.3`、Drizzle `0.45.2`、pg `8.23.0` 沿用；TypeScript `5.9.3` 等工具声明沿用；没有 runtime dependencies、workspace/file 私有源、root alias 或新 optional 兜底 |
| lock / 验证脚本 | pnpm 正常生成 lock，未手改 resolved SHA；安装环境与 generated type consumer 用本仓实际 Identity peer/dev 声明校验；package policy 核 Devkit 不作为 runtime peer。使用 Devkit 公开 `satisfiesCaret`，不复制 checker |
| 正常包边界 | `src/dist/contract/migrations` 与起点逐字节相同；README 与 Devkit 源许可记录更新。工具六个 src/bin 文件与旧 rc2 archive 相同；原 archives 保存在本卡 retained-rollback |

本轮遵循已定规则：0.Y 是 caret 兼容线，同线增量只增 Z。任务枝候选 packageVersion=`0.3.1-rc.1`，**未发布**；包内 contract.version 仍 `0.3.0-rc.1`，协议 token 仍 `'1'`。上一轮下文“待 PM 决定 caret/扩大范围”的建议已被当前 shared 口径取代，不再作为 OPEN 决策。真实 factory 依旧没有跨包 SemVer 全值相等握手，未凭空增加握手、未知版本默认值或放宽 token `2`。

## 门结果与上游 CR

实际 root 命令为 pnpm10.33.0 `install --strict-peer-dependencies --store-dir /Users/yzliu/.cache/hanamesh-deps/pnpm-store`，exit1 `ERR_PNPM_PEER_DEP_ISSUES`：

```text
@hanamesh/server-identity 0.2.0-rc.11
  unmet peer @hanamesh/devkit@0.1.0-rc.2: found 0.2.0
```

冲突 owning 位置为已安装 Identity rc11 `package.json` 的 optional Devkit exact peer。本方移除 unused peer 后，正常安装的工具 0.2 与上游旧 peer 冲突；不以忽略 strict、override、第二物理版本或回退 file vendor 绕过。失败原始 stdout 在 source evidence 保留，末尾空行格式 warning 不改写。

CR → `CONTRACT-IDENTITY-WALLET-UNIQUENESS-01` source writer：在其 origin 去除实际未用的 Devkit runtime peer，正常供给其授权的 Identity `v0.3.0-rc.1` 及源 REPORT（之后正式 `v0.3.0`）；本卡拿到实际源后提升匹配 peer/dev caret 线，正常 strict/frozen/单版本安装，核真实 full ABI、auth/device/principal/types 及适用 suite。两次 fresh source 核查都只有 main17ba、无 v0.3 tag；源 REPORT 不存在。按 WORKER 两次无新结果停点，未继续重复轮询或冻结同一失败图。

| 本轮门 | 结果 / 精确范围 |
| --- | --- |
| root strict / frozen / source 单版本闭包 | **strict FAIL**；frozen 与完整单版本闭包 NOT_RUN；不能拿 failed install 留下的 node_modules 冒 source admission PASS |
| Devkit installed consumer | **PASS**，源公开 contract `checkConsumer`，真实公开 exports 与 CLI；仅此工具消费范围 |
| Node24.13.1 / TS5.9.3 build | **PASS**；生成 dist 字节不变 |
| 受影响 source/http/conformance tests | **28/28 PASS**；本轮未扩大为全部175/PG产品重跑 |
| 正常 npm pack | **PASS**，56成员 / 84269B / SHA256 `c47be10422463472570a633114e3f26ddb6ff18926d749f28a360b3ca3048cb5`；与原正式包53成员相同、仅 package.json/README/许可记录3成员变化，新增/删除0 |
| installed public JS/TS `verify:pack` | **PASS**：无 peer 公开导入、missing Identity fail-closed、正常安装 strict TS；仅已存在 rc11 类型消费，不是 Identity0.3 门 |
| 本轮候选 verify:release / Git新tag consumer | **NOT_RUN**：完整源门失败，未生成新 release manifest/新 tag |
| Identity0.3 实际 full ABI/auth/types / provider / consumer suite | **NOT_RUN**：源候选与 REPORT 未供给；原 rc11 provider25/factory56输入58回执只留原 scope，不升级为0.3 PASS |
| 产品 / GUI / owner / 独立 VERIFY | **NOT_RUN / NOT_ACCEPTED**；不交 TO_TEST |

Usage 业务 `src/service.ts` 使用 Identity authorize/authenticate、deviceAuth.authenticateDevice/getDevicePublicKey、principalLinks.resolveCanonical；不调用 wallets.challenge/bind/listOwn/getBinding。故钱包唯一性业务直接消费 **N/A**，并非整体 Identity 消费 N/A：`src/index.js` factory 仍要求完整 wallets ABI，公开类型仍借 Identity，认证消费仍适用。原 Services `publicABI=true, actualInteractions=false, errorHandling=false` 与两项 NOT_CHECKED、MemoryPool UNIT/FIXTURE 标签不变；原隔离合成 PG 不代产品真实行为。

## 发布位置、卫生与停点

任务枝 [codex/contract-server-usage-main-closure-01](https://github.com/yzsnstotz/hanamesh-server-usage/tree/edc8d72c8a56d5e18053400d6279da7fb93c841b) 已普通 private push：HEAD `edc8d72c8a56d5e18053400d6279da7fb93c841b`，任务树 clean，main 为其祖先。source/config diff --check PASS；raw stdout 原末尾空行 warning 保留。源实现与完整日志在该节点 `docs/acceptance/contract-server-usage-major-compat-01/main-closure-20261009/`，checkpoint 在 `docs/acceptance/AC-13.md`，learning 在 `docs/learnings/2026-10-09-devtool-peer-closure.md`。

**具名不合原因**：root strict FAIL 且缺 Identity0.3 真实供给，因此普通 main merge、新 tag、源完整收口仍待做；不把任务枝候选称正式包。main 仍 `feb7aa18a32f9a84f68e2bd87869b0fbdcf2c942`；原 `v0.3.0-rc.1` annotated object `7aa463521e9a57a96fb7e3627e77f2c4d526ca4f` → feb7aa18、原正常包 SHA580a8d8d…及原 GATE 保持。

候选、rollback、源 worktree、日志均声明于 CLEANUP.json；本轮无常驻产品进程、未动旧实例/源/报告/接受入口。未触及 ~/.dsh、3080、研究 runtime、真实 keys/资金、部署或公开发布。工程上游缺口已路由；活动 BLOCKED 原文归档到 `evidence/main-closure-20261009/BLOCKED-routed-original.md`，不再保留活动 BLOCKED。待：CONTRACT-IDENTITY-WALLET-UNIQUENESS-01；本 origin 独立 peer/dev/vendor/正常包检查已齐，完整 root strict 与 Identity0.3 actual 待源候选，非 owner 账户/GUI 操作。

---

## 上一轮原 REPORT（历史原文，旧 caret/Devkit 口径已由上文本轮事实取代）

# CONTRACT-SERVER-USAGE-MAJOR-COMPAT-01 REPORT

- 结论：本 origin 工程供给已交（DELIVERED / NOT_TO_TEST / NOT_ACCEPTED）。运行时全 SemVer 严格相等假设已核不存在；没有凭空加握手、放宽协议 `2` 或补未知版本默认值。
- writer：Codex `01a11f26-fc80-7f93-b57d-925c6bbdf880`，唯一实现 writer；2026-10-09 JST。
- origin 两问：只改 **hanamesh-server-usage**。Identity 是本仓既有公开 Services/types peer；它属于本仓的消费边界，替换本地合约副本需正常源 tag 安装。没有新增依赖、产品配置、peer 名称、跨插件 import 或邻仓修改。Devkit 是既有开发工具，仍 development-only optional peer，不是合约源副本，不随本包打入。
- 试用入口已起：无（CARD 指定内部工程或合约，owner 不测）。工程入口为已发布私有 tag / 正常包；未做产品 GUI / 本人 / 链动作。

## 可独立已合

| 项 | 实核结果 |
| --- | --- |
| fresh 起点 | remote main `4144a4d2813e2ef581dbac49c31f1e0a7a9b60eb`，从它开隔离 `codex/contract-server-usage-major-compat-01`；primary 旧 checkout、旧 run、原报告及接受入口未动 |
| 表内原任务枝 | `codex/p04-srv-usage-identity10-adapt-01` = `4144a4d2` = fresh 起点 main；`merge-base --is-ancestor` exit0，树差为空，已经完整吸收。具名 **不再合**：重合没有新提交；未把旧失败候选另摘入主线或回退正式字节 |
| 原通过范围 | ledger `2026-10-08T22:51:05.335345+00:00` 实收 formal rc14/main4144a4d/tagb6053e44/normal7f5d，同卡 REPORT/HANDOFF 对应；后续 `2026-10-09T00:58:40.048543+00:00` 关闭内部供给。原 PARTIAL / MemoryPool UNIT/FIXTURE / NOT_CHECKED 不冒整卡产品 PASS |
| 实现节点 | `9d33c44cc503f93c7941b134e53282dbdda5be28`；发布 manifest `2204a6d`；测试安装器沿既有 store 设置 `ae7487f14bc2ae94d1f2c934560c3d48bc4c8432`（excluded，不改正常包字节） |
| 普通 main 合并 | `feb7aa18a32f9a84f68e2bd87869b0fbdcf2c942`，parents `4144a4d2` + `ae7487f1`，真实 `--no-ff` 普通 merge；atomic non-force private push，fresh remote main/task 同此 SHA |
| 新小版本 tag | `v0.3.0-rc.1`，annotated object `7aa463521e9a57a96fb7e3627e77f2c4d526ca4f` → main `feb7aa18`；未改旧 tag、未删远端分支、无公开 release/npm publish/deploy |
| 正常 tag pack | `580a8d8d7085189eba219c0339a428ac949beef50200238eb110121f249108f0` / 84578B / 56 文件；fresh tag export 正常 npm pack 与已过门候选完整 tgz 逐字节相同 |
| Git 卫生 | source 任务枝与 main-integration 工作树干净；原 primary 也仍干净。REPORT/CLEANUP 在独立 hanamesh-docs 任务树交件，保 canonical 的其他并行 dirty/index，不称共享整树 clean |

正常包：`/Users/yzliu/.cache/hanamesh-runs/CONTRACT-SERVER-USAGE-MAJOR-COMPAT-01/formal-package/hanamesh-server-usage-0.3.0-rc.1.tgz`。
正常消费：`git+https://github.com/yzsnstotz/hanamesh-server-usage.git#semver:^0.3.0-rc.1`。
源/tag：[v0.3.0-rc.1](https://github.com/yzsnstotz/hanamesh-server-usage/tree/v0.3.0-rc.1)。本卡最终供给原件 `evidence/formal-pack.json` / `remote-main-tag.txt`。

## 兼容实现与必要一致性

**三个字段不可混用。** 原 rc14 packageVersion=`0.2.0-rc.14`；包内 schema/CONTRACT.version=`0.2.0-rc.13`；IdentityServices.protocolVersion 为可选字面量字符串 `'1'`。`src/index.js:19–35` 是真实 owning factory：省略 protocolVersion 的完整 Services 合法；存在时只查公开 supported token，随后查 required/已提供 optional 方法。没有 packageVersion/contractVersion SemVer 握手或全值相等拒绝点。`src/validation.ts:78` / `src/database/preflight.ts:39` 的 `'1'` 是业务/数据库 schema 令牌，也不改为 SemVer。内包 schema、fixtures、CONTRACT 同发布字节的精确一致性断言属于防 stale pack，保持检查；不是跨版本运行时拒绝。

所以本卡 **没有 SemVer 拒绝补丁**，同-major release/different-major release 的运行时向量 **不适用：没有此 API 输入**；不能把数字/字符串 `2` 改成可接受版本来伪造这两种结果。PM 本轮明确要求“若严格相等缺陷不存在，如实写不存在并保持原行为”，已遵守。

实际兼容增量是 `0.3.0-rc.1` 的 schema release 声明与正常源引用：`x-contract.compatibility` 声明同 major 只加、不把 releaseVersion 当 protocol token；新 schema、provider+consumer 双方 fixtures 及 suite 随同一正常包提供；双方原 fixture 向量逐字节保持，只有 release descriptor 更新。一行变更说明在 schema、README、release manifest。`src/index.js` / `dist/index.js`、全部业务/认证/HTTP/事务/迁移原字节保持；70 个 src/dist/contract/migration 文件相同，正常包56文件中49相同、7个声明/README文件变化，新增删除0（`byte-boundaries.json`）。

本仓 Identity：peer `^0.2.0-rc.11`，dev 引用 `git+https://github.com/yzsnstotz/hanamesh-server-identity.git#semver:^0.2.0-rc.11`；移除本仓3个Identity vendor archives和 active identityArtifact 声明，原字节分别保存在本卡 `retained-rollback/`、原 run 与 Git 历史，未删原报告/rollback。类型、fixtures、suite从正常安装公开包直接取，不复制 checker、软链替包、类型强转或 override。

| 必要门 | 实际结果与限度 |
| --- | --- |
| Node24.13.1 / pnpm10.33.0 / TS5.9.3 | 严格 build/check/preflight exit0，unmet=[]；175/175 unit/source tests。包前 pre-existing baseline source test 6/7：旧测试仍期待 Identity candidate1 hash6c4115d0，而 active formal vendor 是b271；旧失败保留，当前源范围校验替代已失效的 vendor 断言 |
| 源正常安装 | lock-only install、frozen strict-peer exit0，Identity resolves commit `17ba1181041b0b0789f7ffb6373c66e2abb34e77` / package rc11；lock snapshot不是 manifest commit pin |
| 正常 package consumer | 新目录真实 pnpm 安装 tgz + Identity Git tag range；frozen strict-peer exit0；公开 no-peer import、缺 Identity fail-closed、真实 installed strict TS和verify-release全部 exit0 |
| 本方真实提供方/消费方 suite | 隔离 PostgreSQL17.6 tmpfs、空库、非superuser runtime；公开包 createUsageModule + real Identity + Fastify；consumer5/HTTP10/package7 全过。正常持久化、毫秒读回、重放、授权/主体边界、撤回、钩子throw503整体回滚保。数据/设备为合成测试供给，不代 Usage 普通本人新事件 |
| Identity source 门 | 已安装 Identity rc11 真实 HTTP provider25过；它自带 reference consumer16 是FIXTURE，只标其原范围。本方实际已安装 factory56源 Services 输入均符合源 port suite（58回执行），真实受限PG preflight；publicABI=true、actualInteractions=false、errorHandling=false，两NOT_CHECKED保持 |
| 正常 Git tag consumer | `consumers/git-tag` 真正从新Usage `#semver:^0.3.0-rc.1` 与Identity `#semver:^0.2.0-rc.11`安装，frozen strict-peer exit0；解析Usage main/tag commitfeb7aa18与package0.3.0-rc.1，Identity rc11；物理包各1，56/56 payload等正式tgz，公开factory/DTO/conformance导入和absent-Identity拒绝过；相同56字节的完整提供方suite据本轮原结果引用，未重跑 |

合约一致性：**@hanamesh/server-usage v0.3.0-rc.1** 通过（正常包 `./conformance`，本origin `scripts/contract-conformance.mjs`；原件 `docs/acceptance/contract-server-usage-major-compat-01/usage-conformance{,.receipt}.json`）。**@hanamesh/server-identity v0.2.0-rc.11** 真实provider与本方actual factory admission适用门通过（同目录 `identity-consumption.json`）；不声称业务交互/错误处理矩阵已测。

正常包原件与 source evidence：[main](https://github.com/yzsnstotz/hanamesh-server-usage/tree/feb7aa18a32f9a84f68e2bd87869b0fbdcf2c942/docs/acceptance/contract-server-usage-major-compat-01)。最终Git消费收据及重跑脚本在本卡 `evidence/`。试验runner第一次误置tgz路径，容器清理后修正路径得到新结果；npm pack第一次继承了不可写 `/Volumes/clawso-build/.npm-cache`，显式使用共享本项目cache后成功；Git import probe误用未公开canonicalUsageEvent，改用实际公开exports后成功。失败原件/说明保留，没有为过门增加API、改上游fixture或以重试/兜底隐藏问题。

## 兼容门待做 / 精确边界请求

- **caret机制边界已实证，须PM明确口径，不在本卡改shared规则。** pnpm10.33正常Git解析与已安装semver7.8.5实核：`^0.2.0-rc.11`=`>=0.2.0-rc.11 <0.3.0-0`，rc11/0.2.0/0.2.1可匹配，0.3.0-rc.1/0.3.0/1.0.0不匹配；不是“同major所有minor”自动安装。release兼容声明与安装范围是两件事。源 `package.json` peer/dev范围、schema `x-contract.compatibility.packageManagerBoundary`、`evidence/git-tag-consumer.json` 是具体 owning 位置。
- 建议：保当前契约要求的caret时，承认0.x新minor供给的消费者需要按需提升范围下限；若真要求全部major-zero minor自动安装，PM应对范围和预发布策略另作具体shared机制决定（例如非caret `<1.0.0` 范围的边界需另核）。本worker不改其他consumer/Chain/Custody/共享Q，不群改已接受插件，不以本tag替下游消费改钉。
- Git lock只暴露resolved commit；Identity正式rc11和candidate.3都指向17ba1181，两个tag均匹配当前range。不能只凭lock声称resolver一定选择了其中哪一个tag名。实际packageVersion、commit、源normal包一致性均已核；细节见semver-resolution.json。
- Devkit已有工具源是shared仓的 `packages/devkit`；shared `v0.1.0-rc.2` tag不包含该子包，不能猜独立hanamesh-devkit仓或将shared根包冒作devkit。原开发archive/optional peer保持、不随Usage包分发；非本轮合约副本；无需扩大到shared origin。

## 昨日未落实原因的 owning 证据

“本origin昨日未合main”在现场不成立：旧REPORT/HANDOFF+ledger实收+fresh远端main/task同4144a4d2证明已经归线。昨日正式包继续留下精确peer/file vendor，是 `4144a4d2:package.json` / `scripts/contract-conformance.mjs` / old formal release manifest 的真实生产声明，原writer当时同字节正式供给明确未改这些；因此range去副本本轮才实施。源码严格SemVer等值拒绝原因同样不存在，真实拒绝是protocol token和ABI成员；不能把规划推断当根因。原writer停止/正式同字节节点已由指定HANDOFF支持，当前Claude现场只见Host/Custodywriter，无本源并行writer发现。原失败和已接受行为保持；不推断旧worker心理原因。

## 完成判据与未跑

1 已核表内原枝已吸收、原字节/ledger/祖先/差异齐，不合理由具名；2 fresh main隔离开枝，本新增供给普通main merge/private push/fresh读回齐；3 本方Identity合约去副本/Git发布tag范围、正常单版本frozen安装及适用suite齐；4 新minor schema/双fixture/一行说明/normal pack/tag/main和本方一致性齐，无实际SemVer equality缺陷则保持原行为；5 REPORT/CLEANUP、证据与Git卫生按本卡交件。main合并、工程PASS和格式PASS均不称产品ACCEPTED。

**真实产品未跑**：本轮不做owner交测。Usage本人Core同意/renderer普通新事件/真实绑定/401真实新事实/503真实普通事件/本周期撤回/GUI/独立VERIFY/owner ACCEPTED仍由原owning卡和真实供给决定，本卡均NOT_RUN/NOT_ACCEPTED；平台CUA停点、shared Q、真实授权未改。旧MemoryPool UNIT/FIXTURE标签保，新增真实PG只证明本轮隔离harness，不代原产品门。未接触~/.dsh、3080、研究runtime、真实keys、签名/广播/收费/部署/对外发布；工程套件仅既有合成设备/签名fixture和随机内存测试环境口令，无真实钱包/资金或持久凭据文件。

许可/用途：沿用 @hanamesh/server-identity0.2.0-rc.11（private/UNLICENSED，yzsnstotz/hanamesh-server-identity，公开Services/types/fixture/suite）；@hanamesh/devkit0.1.0-rc.2（SEE LICENSE IN LICENSE，shared/packages/devkit，开发验证），不改许可、远端可见性或新增第三方依赖。

清理：见CLEANUP.json。仅移除本卡两个临时PG容器（第一次失败与纠正后均已removed）；没有常驻新产品进程。旧archives迁到本卡retained-rollback，仅本任务枝取消副本，原卡运行目录/活入口/源/报告/rollback全部保。正式包和安装现场保至下游P04-USAGE-INT-01验收或PM具名关闭，不能推测可删。
