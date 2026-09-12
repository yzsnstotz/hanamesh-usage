# 2026-09-13 独立回收判定：activity

来源是 `_deliveries/` 原包、本仓还原后的 `main` 和本目录新跑的日志。原始交付树与归档未改；本目录为回收者新增证据。交付方自报的 `PARTIAL` 未被升级为 `DELIVERED` 或 `ACCEPTED`。

- 通用门：npm ci=0；build=1（tsc 不存在）。见 `install.log`、`build.log`；备用安装日志仅证明备用路径。
- 本地回归：47/47；T05/X03 fixture 变异通过。见 `test.log`／`test-fixed.log`、`mutation.log`／`mutation-fixed.log`。通过的 fixture 不替代真实矩阵。
- 独立发现：生产数值用量适配器没有 DSH TokenUsage 字段契约，现有 reported/estimated 数值是合成数据。
- 真实宿主补测：隔离 `DSH_HOME` 中先装已验收 Registry rc.2，再装本候选，并按两个公开 patch 插入行；两次 `dsh plugin add` 均退出 0（peer 警告保留）。固定 research DSH `web` 启动、token 换 cookie 后，`/api/hanamesh/activity` 与 `/view` 均 HTTP 200，SIGTERM 退出 0。见 `real-install-attempt.log`、`real-config.log`、`real-host-attempt.log`。这是空活动列表的 REAL_HOST 路由证据，不含真实 MOD-06 执行、真实用量或 T02/T04/T09 样本。
- 判定：范围缺口仍在，保持 `PARTIAL`（⚠️）。没有填写用户签名，也没有把清单草稿定稿。
- 最小后续：补目标构建、真实 DSH 数值采集与 T02/T04/T09 真实样本及界面证据。

证据类型以各日志和模块验收矩阵为准；`preflight.log` 只说明条件可见性，不代表真实验证。隔离测试没有访问个人 `~/.dsh` 或 3080。
