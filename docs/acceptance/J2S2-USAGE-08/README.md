# J2S2-USAGE-08 · Q67 分发闭包 / Q61 补遗

结果：阻塞（默认正式 DSH 的实际 resolved peer 不符合既有精确 pin）。
源码/分发候选：0.2.0-rc.25；只本地候选，不发布、不 push，不登记共享 STATUS。
基线最新本地 main：60fe1ed7e1126293ef6dea3e8155d9a60e989020。
运行原件：`/Users/yzliu/.cache/hanamesh-runs/J2S2-USAGE-08`，提交与交付校验见 REPORT.md。

## 条目复核与处置

| 条目 | 当前消费者与证据 | 处置 |
| --- | --- | --- |
| 开发合约 | SOURCE 类型/契约断言；v0.9.0 @ 42661e20b2048cd50b117299d6520badf77d4d08 | 保留 devDependencies 精确 git-tag；没有运行 import/peer；不全升最新 |
| published JS / 声明 | 54 文件 tgz；全新普通 pnpm 消费者 JS 与 strict TS（skipLibCheck:false）通过；合约不可 resolve | 去除公开声明的未用可选 Connection import；依然 optional peer；ABI N/A |
| 默认安装/构建 | 增加从现有 npm 锁导入的 pnpm 锁；目标 Node24.13.1/pnpm10.33.0/TS5.9.3 | 原严格编译保持；完整闭包 37 包/101 边；npm detached 原断言保留 |
| 90 天 / limit | EventStore、UsageStore、HTTP 查询、自有 Settings panel | 具名默认与可见配置，100/1000 不改；pending 不年龄删除；非法值拒绝 |
| inventory / command-source | Loader 扫描、command 原归属、页面归属；HealthSnapshot 原 failures | 失败 bounded code 可见；读取失败不空写；不扩展闭合 health 契约 |
| namespace / 原生 Settings | 普通官方 bundle + Gateway + Cordis 原注入策略 | 修复 namespace 子上下文声明；真实入口/策略/刷新通过；零事件/模型调用 |
| tools/int / runtime | SOURCE 工具解析、隔离路径负例；历史 int 为原卡消费者 | 显式 --card/--run，必传 candidate；保留隔离、3080、容器归属检查；本卡未运行 SQL/command 组合 |
| 旧 DSH 快照 | docs/contracts/host-api 为历史取证；编译消费实际已安装公开声明 | 逐文件存档后保留，不当现行 pin；用户旧 brief 路径当前缺失，旧 alpha.1 不是本卡复核目标 |
| acceptance / 旧包 | 历史真实证据、旧 U31 suite tgz 仍被测试消费 | 920 文件来源 SHA/路径/hash/引用清单已核验；不批量删除 |
| lib / 源码拷贝 | 公开 host/core/client 与 test ESM client | lib/client/index.js 仅退出新包 files，仓内测试消费者保留；当前候选与旧候选 tgz 不覆盖 |
| peer 兼容 | 默认官方 DSH + Usage import base 实际 packageOf | zod 4.6.5 ≠ 4.5.4，真实门失败；其余 10 项匹配；peer 不改 |
| 业务/安全/介质 | 全套负例、20 mutations，包括 X03 反序 | session/turn/终结、同意撤回、签名、原始屏障/写序、export 默认禁用保持 |
| 其他卡/模块/远端 | 仅读本卡模块与安装产物；remote-branches.txt 仅本地 refs | 不碰工作树/进程/冻结 ABI/SQL/AppHost 来源/LICENSE；无远端操作 |

## 实际命令与结果

每项原始 receipt 都包含完整 command/cwd/exitCode/log SHA；本轮不把重试当成功证据。

| receipt（运行目录 evidence） | 命令/范围 | 退出码 |
| --- | --- | --- |
| baseline-card.json | 卡片原 frozen install/build/test/contract | 1：无 pnpm lock |
| native-namespace-red-sibling.json | native Cordis sibling namespace 页观察 | 1：without inject |
| native-namespace-green.json | build + 页观察/生命周期 6 项 + pack | 0 |
| clean-consumer-rc24.json | pnpm install && pnpm exec tsc --noEmit && node runtime.mjs && pnpm list --depth Infinity | 0 |
| native-final-default-install.json | 官方 CLI plugin --profile web add rc.24.tgz | 0（原缺 peer 警告保留） |
| native-final-settings.json | 官方 runProfile + headless Chrome Settings 三项 | 0 |
| native-final-resolved.json | 默认 DSH actual resolved peer | 1：ACTUAL_DSH_PEER_MISMATCH |
| native-final-usage-import-base.json | 从实际 Usage lib/host/index.js URL 复核 peer | 1：同一 zod 不匹配 |
| syntax-and-tools.json | 所有已改 int/runtime JS/Python 语法 + 路径隔离 2 项 | 0 |
| final-gates.json | frozen install/build/test/test:contract/check/preflight/mutation/detached/pack | 0（rc.24 历史检查点；新 rc.25 最终门见下方） |

## PM 请求与门界线

需要 PM 提供默认正式安装即可解析到既有精确 peer 的官方宿主闭包/正式分发依据。
本卡不授权改 peer 或上游策略；不预装合约/zod，不升级整组版本。
这是宿主分发兼容性请求，不是新增服务端口/权限请求；现有公开调用无新增跨模块端口。

限定原生 Settings 回归通过仍不替代 USAGE05 完整 U1、真实 Core/Server、介质持久化或 owner ACCEPTED。
原用户 alpha.1 brief 路径当前不可找到，实时 main 已是 DSH rc.2 精确 pin；无旧宿主兼容声明。
学习记录：[USAGE-006](../../learnings/USAGE-006-published-closure-native-namespace.md)。

## rc.25 最终检查点

提交前审查复现：metadata READ_FAILED 后旧逻辑仍把当前 Loader 条目当作卸载。
新增两个行为负例先红（ERR_ASSERTION），再验证失败发生在 diff/签名/global.set 前；
先前快照不变、签名零次、写入零次、health.available=false。未知的既有 entry 同样保留。
新 invalid/unsafe 条目的原隔离断言保持。rc.24 已被真实宿主消费，tgz 冻结保留；修复使用 rc.25。

最终 receipt：`final-rc25-gates.json`、`card-exact-rc25.json`、`clean-consumer-rc25.json`、
`native-rc25-default-install.json`、`native-rc25-settings.json`、`native-rc25-usage-import-base.json`。
SOURCE 174/174，contract 18/18，20/20 ERR_ASSERTION 变异；native Settings 3/3；
resolved peer 门仍失败（zod4.6.5/4.5.4），结果保持阻塞。每项以原 receipt 退出码为证。

准则核对：1–9 通过。现有合法开发引用保留；没有改变开源用法、服务实现、原 schema/迁移/checksum。
现有元数据 256KiB/32 层为文件读取安全界线，现有 query 上限1000 是公开查询校验界线，
本卡仅具名与展示，不改既有边界；90天/100 默认已有配置。ABI/广播/模板/SQL/AppHost LICENSE 本卡不适用且未触碰。
