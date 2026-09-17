> **↗ RENAMED 2026-09-17：原 hanamesh-plugin-activity → hanamesh-usage。Stage 1 的使用记录插件（三级 Usage Evidence 采集/去重/缓冲/签名/上报，随 Core 捆绑安装）。package.json 名与代码改名由路线 L3 完成。PRD v2.0 §4.2。**

**状态：DELIVERED（等用户验收）— rc.3（随 Registry rc.3 重钉；修复「重钉后宿主无法启动」缺陷）；真实 Codex runtime 样本、真实宿主重建、DSH 原生 UI 驱动的三条记录见 `docs/acceptance/AC-13.md` 文末。ACCEPTED 由用户签。**

## 2026-09-13 本机回收更新

本机 macOS arm64、Node 24.13.1、pnpm 10.33.0、TypeScript 5.9.3 下，完整 `npm ci`、目标 `npm run build`、48/48 测试、2/2 断言有效变异、`check` 和 detached 测试全部通过。针对固定 DSH 实际接口，宿主事件归属改用 `session.isOwnSeq`；完整 `dsh-llm.TokenUsage` 公开声明已核对，现在可逐条累计同一 turn 的 `inputTokens`/`outputTokens`/可选 `totalTokens`，缺字段继续保持 unavailable，不会合成数值或复制原消息。精确 DSH 编译闭包已锁入本仓开发依赖。详见 [本机回收记录](docs/acceptance/recovery-20260913/RECHECK.md)。

依然没有经 MOD-06 的真实模型执行、T02 来源样本、T04 真人 UI 对照、T09 真实敏感样本与原生 DSH 持久化强杀；不能签 ACCEPTED。下面 rc.1 文本是远程交付历史快照，其中“缺完整 TokenUsage/目标工具链”的说法已由本次回收更新，不适用于 rc.2。

---

## 原 rc.1 远程交付快照

# HanaMesh activity · 0.1.0-rc.1

模块仓库：`hanamesh-plugin-activity`。候选 npm 包名采用 `@hanamesh/dsh-activity`；派发 brief 固定仓名但未指定 npm 名，因此该包名是本轮局部命名选择，尚未经宿主装配验证。没有创建远端、推送或公开发布。

## 实际环境与缺口

| 项目 | 产品基线 | 本轮实际 |
|---|---|---|
| Node | 24.13.1 | 22.16.0 |
| pnpm | 10.33.0 | 不存在；用已有 npm 10.9.2 生成本仓 peer 契约锁与候选 tarball |
| TypeScript | 5.9.3 | 5.8.3；核心 strict 语义检查与 emit，未用 noCheck |
| DSH | 0.1.5-alpha.1 @ `5dda764ed3aa172535a7967b06ff95d9cbfe536a` | 只有附件公开声明，没有可运行宿主或完整类型依赖闭包 |
| 平台 | macOS arm64 | Linux x64；不能替代目标平台验收 |
| MOD-06 | `@hanamesh/dsh-agent-registry@0.1.0-rc.3` | 锁定 tarball；rc.3 修复真实宿主外部 runtime 的 agent scope，本模块随之重钉（2026-09-13） |
| ui-kit | `hanamesh-ui-kit` v0.1.0-rc.3 | STATUS 中已 ACCEPTED，但本次附件没有其 tarball、digest 或公开 API |
| 浏览器 / 模型执行 | 隔离 web profile / 真实 runtime | 均未运行 |

派发默认主模型为 Sol 5.6 High；本窗口可识别模型为 GPT-6 Astra Pro，没有模型切换控件或 effort 观测，未声称自动切换。真实 API 费用未知，未调用真实模型。

`npm run build` 会检查目标工具链并拒绝本环境，而非降级冒充成功。`npm run build:offline` 只语义检查并编译无宿主依赖的 `src/core`，复制手写 ESM `src/host`；**宿主 JS 尚未经过完整宿主类型检查或真实加载**。交付 tgz 是便于回收的候选包，不是可用性已验收的正式发布。

## 本轮实现

仅订阅 Registry 已认领的 DSH session：公开 `session/event` 的 `turn/end`，启动时通过只读 `sessionPersistence.list/open/read` 补扫。归因使用同一宿主 `ctx.agents.readBinding()`；插件要求实际 Registry 实例，不新建另一套 Registry，不维护实例、安装、授权或会话权威，不改上游文件或 session 日志。

稳定引用为 `JSON.stringify([sessionId, 'turn/end', turn])`，保留原始 `terminalSeq`。事件重放、同 turn 重复通知不会加量；**不同 turn 是不同执行**，不会仅因用户输入相似就合并；尚未暴露的跨 turn 重试关系不猜测。已持久化记录不可重判，身份冲突显式报错。

记录包括执行者、驱动版本、协议版本、parent session、root/parent execution、provider/model、开始和结束时间、结果、错误摘要、用量来源和规则。无法从公开契约取得的字段保存 `{state:'unavailable', value:null, reason:...}`。父 session 不等于父 execution：后者未公开具体 turn 时保持 unavailable。

`completed` 映射 completed；`error` 映射 failed；`aborted`、`interrupted` 映射 interrupted。`blocked`、`max-tokens` 以及未知扩展不冒充任何成功，result 保持 unavailable，同时保留安全终结种类。不会根据异常文本、当前时间、客户端在线状态自行判定结果。

provider/model 取原始 `request/context`。一个 turn 观察到多个不同路由时保守记 unavailable，不以最后一个 model 冒充整个 turn。数值必须是非负安全整数；有效 0 保留为 reported 0。reported / estimated 分列聚合，空桶为 null；单独提供 unavailable 条数，绝不生成两者相加的总额。

**关键功能缺口：本包尚不能从真实 DSH payload 提取数值用量。** 附件的 `assistant/message.usage` 类型引用 `dsh-llm.TokenUsage`，但未包含该类型的字段定义。适配器不猜 input_tokens/inputTokens、不猜累计/增量口径、不读 raw stream；无 payload 为 `usage_not_reported`，有 payload 但缺契约为 `usage_contract_missing`。样例中的 reported/estimated 数值只验证本模块的归一化 DTO，均为 synthetic，不能当作真实采集成功。

本轮没有云上报，没有身份、云账户、资金或服务器依赖。未来远端四态提供独立文本映射，但未实现远端记录同步。不会自产 Canonical VUC，不包含 VUC、奖励或结算金额字段；预留 `evidenceCommitment`、`signature`、`policyVersion` 只为 null，不签名、不验证、不认领结算权威。

## 存储、恢复与隐私

只写 `dsh-storage-domain` 的 `hanamesh_activity` 域，版本 1、`single` 布局。一次 `global.set({schemaVersion:1,records:[...]})` 发布整幅镜像，记录本身包含去重身份；聚合从镜像派生，没有第二份计数或去重账本。

先等待 `ctx.sessions.flush(session)` 返回有持久监听者参与，再以 persistence 的只读句柄复读同一个终结事件，才写摘要。冷读先经过 `sessionPersistence.flush()`，也复读终结事件。不把事件通知、append 完成或 read 可见性当作持久承诺。崩溃允许只剩原始 session；下次启动补记。**不会合成“中断”事件或向原 session 追加修复**；DSH 自己未持久化的终结还不能被统计。

单进程串行发布；默认最大 5000 条，达到上限拒绝新增并暴露 `CAPACITY_REACHED`，不通过删除旧身份导致历史重放虚增。队列默认最多 128 个 session。拥塞或失败后 health 显示补扫不完整，可用 `reconcile()` 重试。大规模检索、跨进程同时写一个域、保留期迁移和源日志被外部删除后的持续校验均不在 v0.1 范围。

原始 prompt、用户消息、附件、文件内容、完整回答、workspace、authRef、externalSessionId 和原始异常从不复制进摘要。错误只保留固定摘要；字符串元数据采用字符、长度与明显凭据/路径拒绝规则。导出再次逐字段重建 allowlist，禁止未来局部字段通过对象 spread 外流。sessionId、runtime/model 名等仍是可关联的标识，**这是最小化导出，不是匿名化或任意内容 DLP 保证**；不要把导出文件自动发布到公共目录。

导出默认禁用，只有宿主显式配置 `allowExport:true` 才允许；HTTP 复用 Connection 的认证/Host/Origin 检查之后的 exact-fetch registry，不额外提供未认证端口。认证实际执行仍需真实 DSH 验收，本仓 fixture 只检查路由注册契约。生产路径没有云请求、遥测或原始内容日志。

## API 与临时验收页面

`ctx.hanameshActivity` 提供 `query(filter?)`、`export(filter?)`、`health()`、`drain()`、`reconcile()`。查询可按 executor、结束时间范围 `from/to`（Unix 毫秒、含边界）、result、source、quality 筛选，`offset/limit` 分页；默认 100 条，上限 1000。`total` 和 aggregate 覆盖全部匹配记录，不只是当前页。导出同样分页；需要全部导出时按 offset 读取直到累计达到 total，期间避免源数据变化。

启用宿主 Connection 后提供：

```text
GET  /api/hanamesh/activity
GET  /api/hanamesh/activity/view
POST /api/hanamesh/activity/export
```

原生 HTML 页面能筛选并分列显示缺值、reported、estimated；**尚未消费 ui-kit，未做真实截图，不是最终产品视觉交付**。`profile/cordis.patch.yml` 是装配片段，不是完整可启动 profile；它只加本插件，不替换宿主 Registry 或存储后端。配置为 `maxRecords`、`maxPending`、`allowExport`，不接受其他键。

## 锁定产物与复现

Registry tarball SHA256：
`4da9a0fd4a3534afcb8fc8245eb80158f5c3d0b83e960e14d9672d17671cdbf7`。

该原始文件保存在 `vendor/`；`docs/contracts/runtime-registry` 和 `host-api` 仅保留附件的公开 `.d.ts`，**没有复制第二份运行时实现**。实际运行时只通过 peer 消费宿主的同一个 Registry。派发 STATUS 认定 commit 为 `1674d98`；依赖产物的包装来源记录为 `8feded5`，两者未擅自改成相同。

本仓 `package-lock.json` 是 npm 离线生成的 **peer 契约锁**，不是完整宿主依赖闭包；`npm ci --legacy-peer-deps` 不会给你补装缺失 DSH。精确 peers / overrides 保留产品 pin；对公开声明引用但上游未声明的 `dsh-attachment` 增加明确 peer。安装到宿主时，依赖闭包以目标宿主自己的 frozen lock 为准，本包的 overrides 不会自动替宿主根项目重锁依赖。

在仓库根目录复现离线检查（会产生明确 engine warning，不代表目标版本通过）：

```sh
npm ci --offline --ignore-scripts --legacy-peer-deps
npm run build:offline
npm test
npm run test:mutations
npm run check
npm run samples
npm run test:detached
```

X02/X03 测试只 SIGKILL 自己创建的子进程，临时目录由 mkdtemp 创建并清理；确有 OS 强杀与新进程重读，但使用本仓 POSIX 文件 fixture，**不是 DSH 原生介质，更不证明物理断电或磁盘损坏安全**。反序变异的真实失败为 `ERR_ASSERTION`，不是模块加载失败。

真实回收：在已钉住版本的 macOS 宿主恢复本仓，补入 ui-kit rc.3 锁定产物和完整同版本 DSH 类型依赖，先运行 `npm run preflight:host` 与目标 `npm run build`。按既有 runtime 的流程创建全新 `web` profile 和独立 `DSH_HOME`，再用公开命令 `dsh plugin add <本候选tgz>` 安装并启动；不在未知 CLI 上猜 profile/start 参数，不碰个人 `~/.dsh`、个人 3080 或默认全局配置。真实样本、原始日志、截图及原生介质强杀须按 `docs/acceptance/AC-13.md` 补齐。

## 证据与候选交付

离线报告、实际命令输出、47 项测试及变异结果在 `docs/acceptance/`，合成脱敏前后样本明确标注 synthetic。learning 在 `docs/learnings/`。源仓含本地 commit、`main` 分支及候选 tag `v0.1.0-rc.1`，没有正式版本 tag。按派发只交付 bundle、npm pack tgz、SHA256SUMS 三件；不额外生成 STATUS.patch 或另一套状态清单。共享 STATUS 未修改，四字段 checkpoint 在验收记录末尾。
