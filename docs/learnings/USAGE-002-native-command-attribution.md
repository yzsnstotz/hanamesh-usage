# USAGE-002 · Usage 自产命令归属须绑定实际执行的注册 handler

ID: USAGE-002
模块/标签: usage、cordis/internal-get、command-attribution
状态: VERIFIED（SOURCE/FIXTURE + 真实 Cordis 框架；真实 DSH 组合仍待验收）
观察日期: 2026-10-11（Asia/Tokyo）

## 问题与根因
官方 commands rc.2 已有 command/run、command/done，却没有 fork 的 commands/operation。仅按命令名维护归属也会在 scoped shadow 或重注册时误归属；run.source.kind 是调用来源，不是插件包名。

## 方案与约束
在 Usage apply 的第一次存储 await 前安装 internal/get。按其公开签名 `(caller, name, error, next)` 调用 next，一层 Proxy 只包住 register；读取调用方 fiber.entry，注入 child 沿 parent.fiber 找最近 Loader owner。记录 immutable entryId/moduleName；包名仍由 Loader 与 pluginPackages.packageOf 的 canonical manifest 核实。

给注册 definition 的 handler 包一层透明同步函数。原 command/run 已出现时，以 invocation.agent.session + commandId 标记实际被选中的归属。只在同一个原 Session 对象自己的后序 command/done 且 kind=success 时产生同形 succeeded 事实。返回原生 register disposer，保留 Cordis 已 trace 的服务 receiver、scope、handler 返回值、异常和 effect 卸载。

不读取 args、rawInput、attachments、text、完整结果或原始 Error。配对仅存内存，受 maxPending 限制；终结、session/disposed 和 Usage close 释放。已有存储写顺序、消费去重和签名流程保持。注册在拦截器安装前完成或通过 ctx.get 绕过 internal/get 的命令不猜归属，也不追补历史命令。

## 可复用证据与防止重犯
`tests/command-facts.test.mjs` 含真实 Cordis 4.0.4 服务 trace、注入子 fiber、effect 卸载检查，以及 success/error、同名 shadow、跨 session、继承 seq、乱序、隐私 getter、原异常、限流与启动失败清理测试。

卡片验收记录为 `docs/acceptance/J2S2-USAGE-03/README.md`；新增将 error 当 success 的变异必须出现 ERR_ASSERTION。真实 DSH Loader/commands 组合与 GUI 验收另计，fixture 不提升成 REAL_HOST。

隔离工具的 npm ci 必须遵守锁定 peer 闭包：不能一边用 --legacy-peer-deps 漏装 dsh-invariants/session-projection，一边要求 npm ls --all 无缺失。去除该标志后同一锁文件的 detached 离线构建/检查通过，未降级宿主目标。
