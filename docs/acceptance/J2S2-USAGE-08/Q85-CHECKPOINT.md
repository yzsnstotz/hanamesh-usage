# J2S2-USAGE-08 · Q85 续跑检查点

结果：阻塞；不 push、不发布、不新增正式 tag。累计 1.5h 不重置。
续跑基线：本地 main 291b4e659bb3d2f6891639af474bb7b13d7f4c1f；远端 main 经本轮 ls-remote 仍为 60fe1ed7e1126293ef6dea3e8155d9a60e989020。
完整命令、退出码、最新提交和预算结算见本卡运行目录 REPORT.md；旧报告先复制、核验 hash 后保留。

目标固定官方 master `d743267388641bc76f17c45ce8b4c231aed1d32c`。自有隔离完整 clone、原 frozen install、完整 build:official、原 release:pack、prepare:runtime / prepare:packages / prepare:dsh 均退出 0；上游源码、锁和策略未改。
源 manifest DSH 0.2.1-alpha.2、Cordis 4.0.5-alpha.1 和原锁 zod4.4.3 只作输入。生产运行树实际为 DSH alpha.2、Cordis alpha.1、zod4.6.5；原 Node24.21.0/pnpm11.28.5 载荷未替换。模块仍使用 Node24.13.1/pnpm10.33.0/TS5.9.3。

真实 Electron 窗口打开 `dsh-app://app/`，Host 使用默认 desktop profile；生产运行树由官方 pack/prepare 产物构成，没有 workspace-link 到业务源码。载体是官方构建的未打包 Electron shell，不能升级为已安装 Desktop 产品验收。上游文档化 `DSH_PRODUCT_ANALYTICS_OTLP_URL` 指向自有 loopback collector（FIXTURE）；无登录、API Key、模型或业务网络动作。

正常 app.quit 后 PID 与四个自有端口释放，再经生产树 `runDesktopCli` 使用随包 pnpm 公开 `plugin --profile desktop add rc.25.tgz`：退出 1，既有 rc.2 peer 被 alpha.2 兼容门拒绝，package/lock/modules 回滚。`autoInstallPeers:false` 保留，没有风险豁免、预装 peer/合约、手补锁或修改上游策略。安装回滚后 Usage host/client import base 及服务实例不可观察，不制造一个路径声称通过。
首次退出脚本的动态 import 异步失败，脚本 exit0 不证明退出；原错误日志与安装尝试保留，正常退出后的正式负例另行记录。

当前 rc.25 重跑完整 SOURCE 174/174、contract 18/18、20/20 ERR_ASSERTION 变异（含 X03）、check/preflight/detached/pack，均退出 0；tgz sha256 `fd50ed40ec69165408aa73bc4b04612d78091e0b1e0a048c489020f32c8a9750` 与旧候选一致。新的空目录普通 pnpm 消费者 strict 声明与 JS 导入通过，开发合约不可 resolve。这些是旧精确依赖上的 SOURCE/FIXTURE/PACKAGE 门，未宣称新目标行为支持。

目标类型诊断第一次从生产树 baseUrl 编译 exit0，却经 trace 查出回退旧类型：该次不是有效目标类型证据。第二次新空目录普通安装固定 SHA 公开 tarball 的开发引用，TS5.9.3 host/client strict 编译 exit0；23 个框架解析路径无旧框架回退。合法开发 zod4.5.4 保留，未机械升到生产4.6.5。此为 SOURCE 开发类型检查，不是默认生产安装、Native Usage 或严格公开声明消费门。

剩余：逐个真实 Usage host/client import base、Cordis/React/namespace/服务实例、域合法与非法记录、原完整正负例和取消/释放、必要公开 API 内部适配（如实证需要）、目标候选精确支持声明、完整 types/build/test:contract/toolchain/preflight/mutation/detached/pack 与干净消费者，以及限定原生 Usage 回归。完整 USAGE05 U1 和 DESK03 U4/U5 仍独立。本轮没有证明上游缺产物/接口；调用面一次列全于 `q85/evidence/CONSUMER-PORTS.json`，未经运行核验的面标为 NOT_YET_VERIFIED，不伪称接口缺失。

开发合约仍为 devDependencies 正式精确 git-tag v0.9.0 @ 42661e20b2048cd50b117299d6520badf77d4d08；生产没有合约依赖，ABI 不适用。事件归属/同意撤回/签名/原 session 持久屏障/single-domain、默认值、安全头、权限和断言均未修改；不改 AppHost 来源/LICENSE、迁移、冻结 ABI 或他卡环境。
旧 rc.23/24/25、旧失败 receipt 和历史证据字节保留；三个旧解释文档逐项先归档再更正，原 TAP 生成结果归档后恢复既有版本。所有原门保留，准则 1–9 不减。
