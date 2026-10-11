# USAGE-003 · 页面事实由注册方归属与 DOM 提交共同产生

ID: USAGE-003
模块/标签: usage、cordis/internal-get、slots、typert、page-attribution
状态: VERIFIED（SOURCE/FIXTURE + 发布的真实 Cordis/Typert 框架；真实 Desktop 仍待 USAGE-05）
观察日期: 2026-10-11（Asia/Tokyo）

## 根因与处理

Host 的 fork `client-page/opened` 不是官方插件独立可用的事实入口。Usage 应在 Client 对 `slots` 的 internal/get 返回值只包 register，最近 Loader ancestor 确认注册方，以原 receiver 调用原方法、返回原 disposer。只包装四功能位；其他插槽和未知归属保持原行为。包装器保留 props，直到 DOM 有内容节点才通过自有 Remote 报告，StrictMode effect 重放共用一个 claim/sent 引用。子组件可从 null 自行更新成内容，不触发父包装器 render，须用 MutationObserver 观察后续提交；卸载和 Usage dispose 后禁止延迟报告。

客户端 immediately 且清单只依赖 renderer/Gateway 框架服务，不能依赖 Settings 功能贡献者，否则装拦截前它已注册。宿主 composition 仍须在目标贡献者前加载 Usage；不追补旧组件、不改上游。

## Remote 的真实产物差异

Gateway 的 ./client 是 window.__ModuleLoader__ 注册包，不是普通 ESM apply。真实包测试须消费这个公开注册产物。Client $mount 会拒绝 src-json 入参，即使 Host SRC Remote discovery 支持；Usage 请求应提供公开 TypertSchema.parse strict codec。测试最初的导入/codec 失败均保留，未放宽 strict 或替代 Gateway。

Host 从 loader/pluginPackages 取得 canonical 包名并核 Inventory/Manager；request 禁止客户端包名。一次性随机凭据按 Peer/Loader/功能位绑定，先消费再异步校验、排队写，撤回 epoch 还须在队列执行时检查。凭据重放与跨 Peer 变异都必须 ERR_ASSERTION。原单次 global.set、X03 原始持久屏障以及 fc6eda3 命令归属不改变。

## 证据边界

`docs/acceptance/J2S2-USAGE-04/README.md` 保存本轮真实红绿、完整命令及 15 个变异。它不升级为 REAL_HOST/REAL_UI/REAL_CORE/REAL_SERVER 或 owner ACCEPTED。认证 Peer 可申请允许的 Loader 条目；凭据校验不是被攻陷客户端的渲染证明。真实 Desktop 身份投影、同意/撤回仍由 USAGE-05 验收。
