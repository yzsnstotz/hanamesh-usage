# USAGE-006 · 分发闭包与原生 namespace 注入

ID: USAGE-006
模块/标签: usage、pnpm、合约、分发、Settings、Cordis、peer
状态: VERIFIED（SOURCE/PACKAGE/限定原生 Settings；完整 U1 未验证）
观察日期: 2026-10-11（Asia/Tokyo）

## 根因与规则

卡片默认 pnpm frozen install 必须有 pnpm-lock.yaml；从现有 npm 锁导入，不能升依赖或关闭上游策略。
pnpm symlink 不等于可编辑 npm link 项目。npm ls --all 在 pnpm 布局误读第三方开发依赖；
pnpm 全深度清单加物理运行依赖/peer 遍历检查，仍须拒绝缺包、版本不兼容和锁外产物。
npm detached 保留原完整 npm ls --all；第三方 devDependencies 不是消费者运行闭包。

公开声明的空 import 也会要求消费者安装对应包。删除未使用的可选 Connection 类型导入，
将仅构建使用的扩展导入留在 host 源码，不改变 optional peer。干净消费者仅装 tgz 与编译工具，
严格声明编译、JS import、开发合约 MODULE_NOT_FOUND 必须分别验证。
合法开发合约仍是 v0.9.0 精确 git-tag，devDependencies 不等于运行依赖；本模块无 ABI 生成端口。

真实 Cordis 把 remote.<namespace> 作为独立服务。声明 remote 不授权 namespace 调用。
Usage 先挂载自身 Typert contribution，再用 ctx.inject 声明 remote.hanameshUsagePages 与 slots，
观察器使用该子上下文，并在 namespace 释放后停止请求。不能以 get/关闭注入策略绕过门。
根上下文提供的假 namespace 会掩盖该问题；将 namespace 放在兄弟 fiber 才能复现原生错误。
保留页面 DOM 呈现后采集、一次性 credential、peer 归属、取消/卸载与原断言。

## 配置与故障

90 天终态保留、查询默认 100 和上限 1000 保持原值；增加具名常量、校验、配置与自有 panel 展示。
未传 limit 使用配置，显式 limit 优先；pending 不按年龄裁剪。公开 HealthSnapshot 是闭合契约，
不能添加 policy 字段；使用原 failures 字段报告 bounded codes，自有 PanelSnapshot 承载 policy。
inventory 总读取或元数据 READ_FAILED/UNRESOLVED 失败不得提交空快照；
已被接受的 Loader entry 此次不可读，不构成卸载证据，必须在派生/签名/set 前终止扫描；命令归属读取失败仍拒绝记录，并报告可见代码。
不序列化原始 Error，不改持久屏障、single-domain 提交或签名语义。

## 实证与未过门

原生官方 DSH 0.2.0-rc.2 默认 plugin add + runProfile + 无头 Chrome：Settings 入口、策略展示、
只读刷新通过，零错误/零事件/零模型调用。修复前同入口实际进入 settings.section 错误边界。
该门不包含命令、真实 Core/Server、原生介质 kill 或 USAGE05 完整 U1。

默认正式 DSH 安装的运行解析将 zod 选为 4.6.5，Usage 的既有精确 peer 为 4.5.4；
其余十项一致。以实际 Usage import 所在 URL 再核对仍不一致。必须保留失败交 PM；
不能改 peer、预装 zod 或修改 autoInstallPeers 使门变绿。详细命令与结果见同份本卡验收记录。
