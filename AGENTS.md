# hanamesh-usage 开发边界

这是独立模块 `hanamesh-usage`，当前派发 P2，候选 0.2.0-rc.4（rc.1–rc.3 均在被真实宿主消费后按 H-03 作废：可选服务访问、README 逐字、库存终态裁剪）。以 docs 仓 `plans/routes/2026-09-18-P2-usage.md` 为唯一 brief；别把离线证据、STUB/STANDIN 或候选 tag 当作真实宿主验收。共享 STATUS 只能由回收方登记。

仅修改本仓。DSH 产品 pin 为 0.1.5-alpha.1 @ 5dda764ed3aa172535a7967b06ff95d9cbfe536a；目标 Node24.13.1/pnpm10.33.0/TS5.9.3，不为本地工具降级目标。真实依赖只消费锁定产物，不 workspace-link 邻仓。Registry 实例、session、授权、安装状态继续由既有宿主所有。

活动来源是 Registry 已绑定的原 session turn/end。使用原 sessionId/turn，不创建新执行身份。未知数值保持 unavailable/null，有原因；reported/estimated 分列；completed/failed/interrupted 只按公开权威终结种类映射。没有完整 TokenUsage 契约前禁止猜字段或填零。父 session 不是父 execution。

只读原 session。写摘要前等待文档化的原始持久屏障并复读终结，再一次 single-domain global.set；不能分开落盘记录/去重/计数。修改写顺序必须重跑 X03 反序变异。不要把 fixture 文件后端结果冒充 DSH 原生介质证据。

生产路径只保存最小化摘要，不读/导出 raw prompt、文件、完整结果、私有路径或凭据。导出默认禁用，共用 allowlist；不加云回传、VUC、奖励或结算字段。不记录原始 Error；仅 bounded code diagnostics。UI-kit 产物缺失未解决，别造接口或复制替代实现。

`npm run build:offline` 不是目标宿主构建。真实构建用 `npm run build`，保留 strict、noEmitOnError、skipLibCheck:false，不开 noCheck。`npm test`、`npm run test:mutations`、`npm run check`、`npm run test:detached` 是本轮离线复现路径。测试子进程显式 TAP；变异必须观察到断言失败。

测试须新 mkdtemp/独立 DSH_HOME/profile；不动个人 ~/.dsh、3080、不启动真实模型耗额度、不执行远端数据库/网络/资金动作。未获本次明确授权不建远端、不 push、不发布。提交前真实复跑并更新同一份验收记录，按 PRD §18.6 更新 learning；收尾本地 main 干净，PARTIAL 只打候选 tag。交付 bundle+tgz+SHA256SUMS，仓名不加版本后缀。
