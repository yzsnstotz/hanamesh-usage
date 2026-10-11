# J2S2-USAGE-04 · Usage 自产页面呈现事实

结果：完成（工程卡；U1 未通过，真实 Desktop 取证仍属 J2S2-USAGE-05）
提交：以运行目录 REPORT.md 的本地 main SHA 为准；本轮无 push 授权
基线：fc6eda3（J2S2-USAGE-03）；任务分支 task/J2S2-USAGE-04；候选包 0.2.0-rc.21

## 交付

Client Cordis internal/get 包住 slots.register，四功能位 main / settings.section / plugins.bundle.config / plugins.row.config。最近注册 fiber Loader ancestor 捕获 entryId/moduleName；原 receiver、options、props、异常与 disposer 不改。包装组件提交内容 DOM 后经 Usage 自有 pages Remote 报告；空 DOM 不算呈现，MutationObserver 捕获子组件独立的后续提交，StrictMode 重放、卸载与 Usage dispose 不重复或迟报。

Host 通过 canonical Loader/package resolver、当前 active Inventory 与实际 installed/enabled/removable bundle row 核实归属，再发放 Peer/Loader/功能位绑定的一次性凭据。presented 不接收包名/时间/操作身份。先消费再异步复核及 single-domain record，事件只留 SHA-256 幂等键。Core/同意变化、Peer 退出、关闭、过期和容量上限均拒绝旧凭据；撤回 epoch 在队列执行前再次检查。删除对 fork client-page/opened 的监听；fc6eda3 commands/internal-get 和原会话持久屏障实现不改。

客户端清单 immediately，仅依赖 renderer/Gateway 框架服务；不再依赖已先注册功能位的 settings-general。目标客户端仍需在普通功能贡献者前安装/加载 Usage，不追补此前注册。

## 实际验证

Node 24.13.1 / pnpm 10.33.0 / TS 5.9.3。全部最终命令在本卡运行目录下新 mkdtemp DSH_HOME 执行，结束后清除测试 profile；未碰 ~/.dsh、3080、生产、其他会话或模型。

| 命令 | 结果 | 证据 |
| --- | --- | --- |
| npm ci && npm test | PASS，150/150，0 fail/skip | raw/npm-ci.log、raw/npm-test.tap |
| npm run build | PASS，TARGET_SEMANTIC_BUILD_COMPLETE | raw/build.log |
| npm run check | PASS，2 groups / 3 boundaries，0 sibling imports | raw/check.log |
| npm run test:mutations | PASS，15/15 ERR_ASSERTION；含凭据重放、跨 Peer、命令失败误计及 X03 | raw/mutations.log、baseline/mutant TAP |
| npm run test:detached | PASS，锁定离线闭包与独立构建；不是目标宿主证据 | raw/detached.log |
| git diff --check | PASS | 收尾检查；无空白错误 |

raw/verification.json 逐项保存 exitCode。红绿证据：red.tap 先观察旧 fork listener 仍在；client-red.tap 先观察没有包装；startup-red.tap 先观察清单非 immediate；async-dom-red.tap 先观察空 DOM 后缺提交观察。最终 npm-test.tap 全部通过。

第一次 green.tap 的失败写断言期待异常，与既有 record 返回 rejected 契约不同，修正断言后通过。build-first.log 保留初始 Cordis Fiber/disposer 类型误用；green-second.tap 保留把 Gateway 浏览器注册包当 ESM 的错误；remote-green.tap 保留 vm sourceMappingURL 缺换行的错误；remote-green-second.tap 保留 Client 不接受 src-json 入参的真实失败。修复均以公开发布 API 为依据，无重试兜底或放宽编译。

## 开源与合约

| 名称 | 版本 | 协议 | 来源 | 用途 |
| --- | --- | --- | --- | --- |
| @deepseek-ai/cordis | 4.0.4 | MIT | 锁定 npm；deepseek-ai/deepseek-harness | internal/get、Service trace、Fiber/effect |
| @deepseek-ai/dsh-session | 0.2.0-rc.2 | MIT | 锁定 npm；同上 | 保留原 Session 生命周期契约 |
| @deepseek-ai/dsh-typert-protocol | 0.2.0-rc.2 | MIT | 锁定 npm；同上 | pages Remote Service/marker、strict codec 协议；新增 peer |
| @deepseek-ai/dsh-api-gateway / dsh-typert-registry | 0.2.0-rc.2 | MIT | 锁定 npm；同上 | dev-only 实际 Host/Client Remote 挂载/分发测试 |
| @deepseek-ai/dsh-client-ui-slots / dsh-client-ui-renderer / dsh-api-remotes | 0.2.0-rc.2 | MIT | public npm tgz；同上 | 只读公开注册与贡献者接口；未复制 UI 实现或添加运行 import |
| react | 18.3.1 | MIT | 锁定 npm | Host-shared createElement/ref/effect |
| @hanamesh/api-contracts | 0.1.0 | MIT | 锁定已发布 git v0.1.0 | C-CORE / C-USAGE-LOCAL / C-USAGE 不变 |

内部协议、字段、结果、示例和模拟实现见 docs/contracts/usage-pages.md。本卡无合约变更请求。旧文档仓 brief 已由前卡记录缺失，本轮按明确卡片/PM 路线执行；未写文档仓或共享 STATUS。

## 交付与剩余门

运行目录保留 REPORT/CLEANUP、bundle、tgz、SHA256SUMS、第三方清单及中断文件原始 hash。遵守用户 AGENTS 的本轮无远端授权：只提交并合入本地 main，不 push/发布；origin/main 保持基线。本卡是独立工程交付，没有 owner ACCEPTED、U1 或真实 Desktop 通过声明。

真实 Cordis/发布 Typert 框架测试使用内存 Connection 载体与 Core/Loader/Inventory fixture，不是 REAL_HOST/REAL_UI。凭据阻止未发放、改提交身份、跨 Peer 和重放请求，不是任意被攻陷客户端的渲染证明；已认证 Peer 可申请任意允许的 Loader 条目。DOM 观察不证明 CSS 可见性或 Portal 内容。真实 Desktop Loader-to-Client identity 投影、贡献者加载顺序、归属/同意/撤回仍由 J2S2-USAGE-05 取证。
