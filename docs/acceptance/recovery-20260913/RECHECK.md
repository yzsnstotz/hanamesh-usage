# Activity rc.2 本机回收 · 2026-09-13

**PARTIAL；只关闭目标构建与本地数值适配，未取得用户清单 T02/T04/T09 的真实样本和截图。** 原 rc.1 远程记录及旧失败日志原样保留；下列输出来自本机 macOS arm64 / Node 24.13.1 / pnpm 10.33.0 / TypeScript 5.9.3。

根因一：实际 DSH session 公开 API 用 `isOwnSeq` 判定事件归属，旧适配器调用 `ownsEvent`，真实宿主会抛错。先以固定 API fixture 看到 6/10 测试失败，再修复并复跑 48/48。根因二：rc.1 附件缺 `dsh-llm.TokenUsage` 字段与完整 DSH 类型闭包；本机固定版本声明提供 `inputTokens`、`outputTokens`、可选 `totalTokens`。本包现在仅对同一 turn 的 `assistant/message` 用量做安全整数逐条累计；缺失仍 `unavailable`，不把 `0` 和缺值混淆，不复制 prompt、附件或回答。宿主类型引用也加载实际 Cordis augmentation，没有关闭 `skipLibCheck`。

| 命令 | 结果 | 原始证据 |
|---|---|---|
| `npm ci --ignore-scripts --legacy-peer-deps` | exit 0；精确 DSH 编译闭包与 Registry 原 tgz 在本仓锁中 | `target-revalidation/install.log`、`.exit` |
| `npm run build` | exit 0；严格核心与宿主 JS 类型检查 | `target-revalidation/build.log`、`.exit` |
| `npm test` | exit 0；48/48、无 skip | `target-revalidation/test.log`、`.exit` |
| `npm run test:mutations` | exit 0；T05 `unavailable→0` 和 X03 反序均由断言杀死 | `target-revalidation/mutations.log`、`.exit` |
| `npm run check`; `npm run test:detached` | 均 exit 0；后者在无邻仓源码的副本构建/消费 | `target-revalidation/check.log`、`detached.log` 及 `.exit` |

所测 `TokenUsage` 是固定 DSH 类型与合成事件，不是一次真实模型执行；T02 的真实来源、T04 真人 UI 缺值/零值截图、T09 真实敏感输入前后对照仍缺。ui-kit rc.3 的 tgz 已在同一交付树的 workspace/vendor 找到，但未把临时 HTML 冒充正式 UI 集成。T07 真实三终结、T11 断云、T12 原生日志/sidecar 复读、X02/X03 原生介质强杀也未完成。没有调用模型或付费 API。候选包在本地打包，摘要以同目录交付清单为准；用户仍须亲跑并签 AC-13 才能写 ACCEPTED。
