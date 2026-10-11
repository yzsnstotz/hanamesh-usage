# USAGE-005 · detached 的 peer 闭包与失败证据

ID: USAGE-005
模块/标签: usage、npm、peer、detached、离线、工具隔离
状态: VERIFIED（SOURCE/OFFLINE；非真实宿主或 UI）
观察日期: 2026-10-11（Asia/Tokyo）

## 症状与根因

Q-18 的历史独立副本用 npm ci --legacy-peer-deps 安装 31 包，正常冻结安装为 33 包；
缺 dsh-invariants、dsh-session-projection 后，完整 npm ls --all 正确失败。
fc6eda3 已去掉显式参数，但 npm 仍消费继承的 npm_config_legacy_peer_deps=true。
本卡当前锁已演进：红测安装 35 包且同两项 missing；正常冻结安装与修后 detached 均为 37 包。
数量只描述对应锁的实测值，不能把旧数量写成固定验收标准。
旧 finally 删除整棵临时目录，连失败副本诊断也被删除。

## 修复与复用规则

独立副本使用原 package-lock.json、offline、ignore-scripts；显式 legacy-peer-deps=false，
include dev/peer/optional，清除子进程 omit 并包含 dev，保证 NODE_ENV=production 也不裁剪检查闭包。
npm ls --all 与 tools/check.mjs 的全部断言保留，包版本、生产代码和写入顺序不变。
从调用方缓存只复制 _cacache 到本卡新 cache，不复制 npm 配置、凭据或兄弟源码；
新 HOME/DSH_HOME/profile/TMPDIR 与 npm 诊断均在 mkdtemp 内。关闭审计、更新通知，保持 offline。
编译器优先使用副本 node_modules/.bin，不依赖原仓 npm script 注入的工具路径。
每步原始 stdout/stderr 和 commands.json（命令/cwd/status/signal/errorCode）在清理后保留；
finally 只删除自己创建的 hanamesh-usage 副本，保留日志/home/cache 供回收方按 CLEANUP 回收。
不要以重试、忽略 peer、放宽 check 或改成目标宿主构建标签处理失败。

## 实跑证据与边界

tests/detached.test.mjs：继承 legacy/omit/production 时完整冻结闭包仍通过；
空离线缓存真实 ENOTCACHED 时退出失败，命令/错误日志仍在，调用方 home/cache 仍在，副本已清理。
红测为 ERR_ASSERTION；最终 npm ci && npm test && npm run test:detached exit 0，157/157。
额外 npm run build、check、17/17 ERR_ASSERTION mutations 均通过（包括 X03 反序）。
同份验收见 docs/acceptance/J1S4-USAGE-07 和 AC-USAGE.md；原件在本卡运行目录。
这是工具卡完成，detached 仍仅 OFFLINE_CORE_SEMANTIC；不产生 REAL_HOST/REAL_UI/ACCEPTED。
