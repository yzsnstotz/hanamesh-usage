# P04-USAGE-INT-01 · 首段证据（Usage rc.16 + 本卡 Host34/ServerUsage11/PG）

- `walk/`：证据驱动脚本只点开发小界面自己的按钮（00 打开 → 01 开启同意 → 02 执行 /check-updates → 03 读服务端 → 04 重放 → 05 再读 → 06 另一主体写 1 条 → 07 撤回 → 08 撤回后再执行 → 09 再读 → 10 读另一主体）。`drive.json` 是每一步页面上实际显示的文字；截图只留 00/03/04/07/08，其余完整截图在 run 目录 `_evidence/walk-rc16/`。
- `consistency.json`：本机 178 条与服务端 178 条事件 ID 集合一致；时间只到秒一致（服务端读回映射丢毫秒，数据库存毫秒，归 hanamesh-server-usage）。
- `db-facts.txt`：只读事务直查本卡 PG：撤回后本设备 0 行、另一测试主体 1 行、本设备撤回记录 1 行。
- `entry/`：首步截图（127.0.0.1 与 localhost 带查询/锚点尾巴）。
- `engineering/`：red（readRemote 缺失时 4 项 TypeError）、全量 128/128、check、12 个变异全部 ERR_ASSERTION、公开 CLI 安装回执、rc.16 tgz sha。

测试供给：Core 适配（同意/设备密钥/请求签名）与另一测试主体是 fixture；普通动作是宿主公开命令调度的真实已装插件命令，不是 Renderer GUI。真实 Core 本人同意闭环 NOT_RUN。
