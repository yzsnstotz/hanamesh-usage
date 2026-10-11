# J1S4-USAGE-07 · 独立冻结安装的完整 peer 闭包

结果：完成（SOURCE/OFFLINE 工具卡；整体真实宿主/UI/owner 验收仍 PARTIAL）
提交：运行目录 REPORT.md 记录最终本地 main SHA；本轮不 push、不发布。
基线：6f724fced6048539cc2e62d549b769091232449a；任务分支 task/J1S4-USAGE-07。
候选产品版本保持 0.2.0-rc.22；只改工具、回归测试、验收及 learning。

## 调查与改动

Q-18 原始 31/33 包证据见 J2S2-USAGE-03/raw/detached-first-failure.log。
fc6eda3 已移除显式 legacy 参数。本卡红测再证明继承 npm_config_legacy_peer_deps=true
仍漏装 dsh-invariants/session-projection：当前锁 35/37 包、check 报 ELSPROBLEMS。
失败证据随整个临时目录清理丢失，第二个红测也真实失败。

修后 ci 显式 legacy-peer-deps=false 并包含 dev/peer/optional；子进程清除 omit、包含 dev，
不受 production 环境裁剪。原冻结锁、不忽略 peer、完整 tools/check 断言保留。
独立 mkdtemp HOME/DSH_HOME/profile/cache/tmp，缓存只从调用方 _cacache 克隆。
不读兄弟源码、不 workspace-link、不复制用户配置/凭据；所有辅助目录位于本卡 TMPDIR。
三步命令各自保留 stdout/stderr/status/signal/code；只清理自己创建的仓副本。
输出 DETACHED_CORE_BUILD_COMPLETE / OFFLINE_CORE_SEMANTIC_BUILD_COMPLETE 原等级不变。

## 新鲜实跑

目标 Node 24.13.1 / pnpm 10.33.0 / TypeScript 5.9.3。卡片命令未改：
`/bin/sh -c 'npm ci && npm test && npm run test:detached'`。
PATH/TMPDIR/DSH_HOME 按卡片；额外独立 HOME/npm cache 与 offline/audit/fund/update-notifier 设置
见 raw/card-test-receipt.json。没有模型请求、真实宿主、3080、远端数据库或资金动作。

| 门 | 结果 | 同份证据 |
|---|---|---|
| 卡片完整命令 | exit 0；npm ci 37 包；157/157，0 skipped；detached 37 包及完整 check | raw/card-test.log、raw/card-test-receipt.json |
| 红测 | exit 1；peer 缺失与清理丢证据均 ERR_ASSERTION | raw/red-peer.tap、raw/red-peer-receipt.json |
| 初次工具直调红测 | exit 1；原工具依赖 npm 提供 tsc PATH、失败证据丢失 | raw/red.tap、raw/red-receipt.json |
| 专项绿测 | 2/2；最终完整命令另覆盖 legacy/omit/production 配置 | raw/green.tap、raw/card-test.log |
| npm run build | exit 0；TARGET_SEMANTIC_BUILD_COMPLETE，非真实宿主消费/UI | raw/build.log、raw/extra-checks.json |
| npm run check / npm ls --all --json | exit 0；无 problems，全部断言保留 | raw/check.log、raw/normal-closure.log |
| npm run test:mutations | 17/17，baseline 0、mutant 1、ERR_ASSERTION；含 X03 反序 | raw/mutations.log；原始 TAP 在运行目录 mutations/ |

原始输出/失败日志/每步命令退出码保留在 /Users/yzliu/.cache/hanamesh-runs/J1S4-USAGE-07。
仓内日志仅规范化行末空白，原件保留。REPORT/CLEANUP 与 bundle/tgz/SHA256SUMS 在同目录。
开工前未提交 TAP 原样保全至 pre-existing/ 并留独立 stash，不并入本卡提交。
仅本地 main 合入；共享 STATUS 不改。learning 为 USAGE-005；不写文档仓。
旧唯一 brief 路径在现有 docs 仓未找到；本工具修复仅按已明确派发卡和本仓边界实施，不扩产品范围。

许可 · 来源 · 用途：Cordis 4.0.4、dsh-session/dsh-invariants/dsh-session-projection 0.2.0-rc.2 / MIT /
锁定 npm（deepseek-ai/deepseek-harness）/ 原 D-3 dependency 闭包；api-contracts 0.9.0 / MIT /
正式 Git v0.9.0（42661e20）/ 原契约消费；TypeScript 5.9.3 / Apache-2.0 / npm / 严格语义编译。
