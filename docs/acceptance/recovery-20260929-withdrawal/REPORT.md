# P04-U03 持久撤回恢复修复 · 2026-09-29

唯一 origin：`hanamesh-usage`；base `7b2e79c20b2ff6594f8b88ebd3dc047fbab1dd6d`，候选 `0.2.0-rc.8`。实际消费者为 CORE 同意UI与 SUSAGE 的设备事件DELETE；组合节点 `PRODUCT.P04.compose` / `MAC-COMPOSE`。父有限本机计划 `PRODUCT_DELIVERY_PLAN.json` SHA256 `bb066b5eaacb59ae214e47d578c2f47c400ff7310b9698df4f797646d1f529b5`，不是整包runner执行。

## 判定与补齐

判定：**CONFIRMED REAL_HOST + STANDIN + STUB**。安装原rc.7进全新隔离profile，真实DSH Loader产生并上传153个安装事件；STUB DELETE返回503后保存pending/attempts1。SIGTERM、同存储重启、STUB恢复在线，再观察65秒：DELETE计数仍1，pending/attempts1不变，outbox stopped且nextAttemptAt null。原始 `raw/baseline-reproduction.json`。初始CORE为可见标注的STANDIN；删除目标为本机STUB，不是生产API/REAL_DB。

根因：撤回任务虽落盘，重启仅 `reporter.start()`，withheld直接stopped，不恢复删除定时器；原 `grant()` 无条件clearWithdrawal还会吞掉未完成删除。

补齐：attachCore恢复持久pending删除；重新授权先完成旧DELETE，失败保留义务并阻止新事件上传；临时缺core/origin也不能把已存在的远端义务改成local-only；成功后根据当前同意恢复上传。重试与上传用同一tail串行化；卸载等drain后再stop一次，阻止恢复期间产生的定时器越过拆除。初始无serverOrigin的本地撤回仍offline并只清本地。无新依赖、HTTP/DTO/schema/同意UI改动；只改变USAGE内部恢复行为。

## 本轮验证

| 门 | 结果 | 证据类型 / 原始输出 |
|---|---|---|
| 原基线107测试 | PASS | SOURCE/FIXTURE；父分支 `baseline-tests.tap` |
| 重启和regrant两条RED | PASS（确实捕获旧缺陷） | FIXTURE；`raw/withdraw-red.tap`两条ERR_ASSERTION |
| 临时缺origin RED | PASS（捕获义务被降级） | FIXTURE；`raw/withdraw-origin-red.tap` ERR_ASSERTION |
| 最终111测试 | PASS | SOURCE/FIXTURE；`raw/fixed-tests.tap`，111 pass / 0 fail |
| 固定工具链build | PASS | Node24.13.1/pnpm10.33.0/TS5.9.3；`raw/fixed-build.log` TARGET_SEMANTIC_BUILD_COMPLETE |
| 12变异 | PASS | FIXTURE；`raw/fixed-mutations.log` 12条ERR_ASSERTION（新增丢重启任务/重授权吞任务）；原远端先删变异保持有效 |
| check | PASS | SOURCE；`raw/fixed-check.log`，无经济字段/跨插件import/新增依赖 |
| detached离线闭包 | PASS | SOURCE；`raw/fixed-detached.log`（只证明隔离core构建，不扩为完整宿主） |
| 原pending任务升级恢复 | PASS | REAL_HOST+STANDIN+STUB；`raw/fixed-reproduction.json`，旧task attempts1→2/sent |
| sent后再次进程重启 | PASS | REAL_HOST+STANDIN+STUB；DELETE未重复；外部分支 `raw/fixed-sent-restart-no-resend.json` |
| 失败撤回→重新授权→恢复网络→granted重启 | PASS | REAL_HOST+STANDIN+STUB；失败regrant仍pending/attempts2，重启成功DELETE后withdrawal null/outbox idle |
| 实际安装字节 | PASS | REAL_HOST installed rc.8与候选tgz的44文件逐项SHA全部匹配；`raw/installed-candidate-identity.json` |
| 完整P04客户UI→真实SUSAGE/PG删除 | NOT_RUN | 本切片不使用生产身份/凭据/数据；需要root组合和不同validator从实际UI继续 |
| P01真实provider/账户积分/完整重启 | NOT_RUN | 此修复不替代P01完整产品验收 |
| 非本Mac平台 | NOT_RUN | 本机darwin-arm64；无其它平台真机，不外推 |

候选tgz SHA256：`81a3b325265b235bad8558cd683bd555f2fe7b2ca2a69ccf113ad5d56a729a8d`。

真实宿主固定树：`hanamesh-dsh-runtime` rc.3 / HEAD `1a49060167076534b6b7dd0d4f378a901c00a4e5`，DSH `0.1.5-alpha.1`，manifest runtime digest `33b4607116ed811a420344dfee75e447e006047c73a7f31c180c234e631ed0df`。使用该既有树，不读取/修改research runtime。

隔离配置：HOME=DSH_HOME为本分支host-home，env仅显式allowlist（HOME/DSH_HOME/PATH/TMPDIR/CI）；独立npm cache及pnpm store。端口55694/55695与56571/56572已确认释放。无Codex调用、生产写入、凭据读取、新远端、push或发布。canonical usage main未修改，父节点负责检查后整合。

## Applied Laws / Learnings

`laws/environment-matrix.md`仅支持本轮Mac证据；`harness-passes-do-not-prove-host-integration`保持完整UI门NOT_RUN；`isolated-profile-must-sanitize-inherited-credentials`用于子进程env allowlist。未修改docs laws/learnings metadata。本报告上限是有限修复可交组合验证，不宣称产品DELIVERED/用户ACCEPTED。
