# J2S2-USAGE-03 · Usage 自产命令归属

日期：2026-10-11（Asia/Tokyo）
结果：完成（本地模块卡）；交付上限：DELIVERED / 候选，非 ACCEPTED。
候选包：hanamesh-usage 0.2.0-rc.20；基线：04867c6。

## 卡片设计与实现

已按卡片 P-U 在 Usage 自己的 Host 路径监听 Cordis internal/get 并包住 commands.register。捕获真实调用 fiber 的 Loader owner（包含注入子 fiber）；以实际执行的注册 handler 绑定原 Session + commandId，配对自己的 command/run 与后序 command/done(success)，产出同形 succeeded 事实，送入 mount 的现有包核验、签名 use 和去重逻辑。原 commands/operation 监听已移除，上游和合约包未修改。

拦截器在第一次异步存储打开之前安装，失败/卸载移除。无原生 owner、不成功、继承事件、未配对、跨 Session、错误顺序均不制造 use。配对有 maxPending 上限，session/disposed 释放未终结项。不读取参数或结果正文；默认导出、同意与 single-domain 写路径沿用现有实现。页面来源不在本卡范围。

## 同一候选的验证记录

| 路径 | 结果 | 证据 |
| --- | --- | --- |
| npm ci && npm test | PASS，142/142，无失败/跳过 | raw/npm-ci.log、raw/npm-test.tap |
| npm run build | PASS，TARGET_SEMANTIC_BUILD_COMPLETE | raw/build.log |
| npm run check | PASS，strict、skipLibCheck:false，0 siblingSourceImports | raw/check.log |
| npm run test:mutations | PASS，13/13 ERR_ASSERTION，含命令失败误计与 X03 | raw/mutations.log、各 baseline/mutant TAP |
| npm run test:detached | PASS，独立 mkdtemp、锁定离线安装及构建 | raw/detached.log |
| 新命令归属回归 | 9/9；原生 Cordis 4.0.4 服务与 effect + Session/Core FIXTURE | raw/green.tap |
| Red → Green | 缺拦截、缺 disposed 释放、启动拦截太晚均先 ERR_ASSERTION 再修复通过 | raw/red.tap、raw/disposal-red.tap、raw/startup-red.tap |

工具链：Node 24.13.1、pnpm 10.33.0、TypeScript 5.9.3。首次 detached 因 --legacy-peer-deps 漏装锁定 peer 导致 npm ls 失败，保留 raw/detached-first-failure.log；去掉该参数后通过，不放宽检查、不改变依赖版本。Detached 是离线复现，不等于真实宿主构建或原生介质验收。

## 开源与合约

| 名称 | 版本 | 协议 | 来源 | 用途 |
| --- | --- | --- | --- | --- |
| @deepseek-ai/cordis | 4.0.4 | MIT | npm 锁定产物；deepseek-ai/deepseek-harness | 原生 internal/get、Service trace、effect |
| @deepseek-ai/dsh-session | 0.2.0-rc.2 | MIT | npm 锁定产物；deepseek-ai/deepseek-harness | 原 Session 自有 seq 与生命周期契约 |
| @deepseek-ai/dsh-commands | 0.2.0-rc.2 | MIT | public npm tgz；deepseek-ai/deepseek-harness | 只读核对 register/handler/run/done 顺序，未添加运行依赖 |
| @hanamesh/api-contracts | 0.1.0 | MIT | 已锁定 git tag v0.1.0 | C-CORE、C-USAGE-LOCAL；本卡无变更请求 |

## 交付与剩余门

运行目录 `/Users/yzliu/.cache/hanamesh-runs/J2S2-USAGE-03` 保存 REPORT、CLEANUP、bundle、tgz、SHA256SUMS 和第三方清单。源码/构建产物一起提交，候选升 rc.20，结束时本地 main 干净。遵循 AGENTS 本轮无远端授权：不 push、不发布、不写共享 STATUS 或文档仓。

指定旧 brief plans/routes/2026-09-18-P2-usage.md 在给定文档位置缺失；本卡明确设计作为本轮执行范围，宿主旧 pin 不修改。真实 DSH Loader/commands 组合、真实介质/GUI、owner ACCEPTED 均不由本轮离线测试证明；回收方仍须检查宿主 composition 在命令贡献者注册前加载 Usage。拦截前的注册和 ctx.get 旁路不伪造归属。
