# 终结通知不是持久证据：活动摘要必须后于原 session
ID: ACTIVITY-001
模块/标签: MOD-11、activity、durability/privacy
状态: VERIFIED
证据类型: SOURCE / FIXTURE
适用范围: DSH 0.1.5-alpha.1 @ 5dda764ed3aa172535a7967b06ff95d9cbfe536a；MOD-06 0.1.0-rc.2；事件来源 Registry 绑定 session 的 turn/end；本轮 Linux x64 Node22.16.0 文件夹具，非真实 DSH
可见性: INTERNAL

## 问题或目标
session/event 可在原始终结事件还未持久化时触发。此时提交活动摘要，强杀可能只留下无来源的成功记录。

## 复现／证据
附件 `dsh-session/types/types.d.ts` 的 turn/end 说明事件边界不等待 flush；`dsh-session-persistence/types/handle.d.ts` 将 read 可见、append 接受与 flush 持久承诺区分；`dsh-storage-domain/types/domain.d.ts` 规定先持久后发布内存。

`tests/host.test.mjs` 验证 flush 参与及原终结复读；`tests/crash/boundary.test.mjs` 真正 SIGKILL 本仓文件夹具子进程，在新进程检查残留。正序 sourcePresent=true/summaryCount=0；反序 sourcePresent=false/summaryCount=1，并触发 ERR_ASSERTION。原始输出在 `../acceptance/raw/X03-reverse-durable-order-{baseline,mutant}.tap`。**真实原生 DSH flush/介质、目标 macOS 和断电均未验证**，不推广该 VERIFIED 标记。

## 原因与方案
只观察事件或读取持久层缓存不足以证明落盘。通过 `commitAfterSource` 顺序执行原 session 屏障、复读 terminal、摘要一次完整镜像写入。没有持久监听者或复读不一致就不写摘要；重启从源只读补扫。不要以本模块名义修复源日志或创造 interrupted 终结。

## 修复／复用办法
`src/host/mount.js` live/cold 路径共用顺序函数；`src/core/store.ts` 一次 global.set 使摘要与身份同生效；计数派生不另存。域名 `hanamesh_activity`，single 布局。注入 `storageDomain` 服务而不只等待 storage hub，并由插件自己的 effect 关闭返回的 domain。

原始内容不进入摘要；统一 allowlist 逐字段投影，错误仅固定摘要，导出默认禁用；样本均为 synthetic。来源明确不代表允许公开 session 身份。

## 防止重犯
`npm test` + `npm run test:mutations`；变异 harness 固定 TAP，仅 ERR_ASSERTION 算变异被杀，模块加载/超时不算。X02/X03 原生介质项继续 BLOCKED。真实宿主补测才能改变验收矩阵。

## 来源与维护
FR-10 / AC-13 / CONSISTENCY X01–X03；本轮 activity agent；最近验证 2026-09-13（Asia/Tokyo）。DSH 或 Registry pin 更新、存储后端/布局改变时失效，需重跑。
