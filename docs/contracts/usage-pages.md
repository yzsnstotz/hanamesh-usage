# Usage 内部 pages Remote（rc.21）

这是 Usage 客户端与 Usage host 自身的内部协议，不扩展 C-CORE、C-USAGE-LOCAL 或 C-USAGE；本模块不安装任何 HanaMesh 合约包或邻仓模块。

客户端 `remote.$mount(pagesContribution)` 选入 `hanameshUsagePages`；host 经公开 TypertRemoteService/Remote 暴露同名命名空间。使用现有 Connection/Gateway 的认证 Peer，不创建新连接或执行身份。Client 请求是 strict codec；host 对每个 JSON 请求作完整字段校验。客户端没有 packageName、occurredAt、operationId 或 sourcePlugin 写入口。

| 方法 | 入参 request（仅这些字段） | 成功值 | 拒绝 |
| --- | --- | --- | --- |
| issue | `{entryId, moduleName, surface}`；三个 string；surface 为四功能位之一 | `{disposition:'issued', credential}` | `{disposition:'withheld'}` 或 `{disposition:'rejected'}` |
| presented | `{credential}`；string | 现有 record 返回 `{disposition:'recorded', eventId}` | 无凭据、过期、重放、Peer 不同、已撤销、归属变化：`rejected`；record 写失败：`rejected` + bounded `code` |

调用返回宿主标准 `RemoteResult<T>`。缺少调用上下文时以 bounded `USAGE_PAGE_PEER_REQUIRED` 失败；strict Client 参数错误为 `USAGE_PAGE_INVALID_REQUEST`；框架传输失败沿用 Gateway 的 `gateway/internal` / `gateway/cancelled`，无私有 Error 日志。

示例：

```js
const claim = await ctx.remote.hanameshUsagePages.issue({
  entryId: 'include:ordinary-page', moduleName: 'ordinary-plugin/client', surface: 'main',
});
if (claim.ok && claim.value.disposition === 'issued') {
  await ctx.remote.hanameshUsagePages.presented({credential: claim.value.credential});
}
```

最小模拟：`tests/fixtures/host.mjs` 的 fixtureHost 提供真实 Usage `pages` seat，Core、Loader、Inventory/Manager 是显式 fixture；`tests/page-client.test.mjs` 的 setup 提供固定 issue / presented 的 RemoteResult。`tests/pages-remote.test.mjs` 再用锁定发布的真实 Cordis、Typert Registry 与 Host/Client Gateway 检查两端方法和 Peer 的连接；载体是内存模拟，没有网络、真实 DSH 或真实 Desktop。

credential 只在内存保存，最多 maxPending（默认 128）项，60 秒后拒绝；host 先消费再复核，再排队到已有 single-domain record。队列执行前再次检查同意 epoch；Core/同意改变、Peer 退出或 Usage 关闭撤销。事件保留 SHA-256 幂等键，不保留 credential。初始空组件用 MutationObserver 观察子树的后续 DOM 提交，卸载断开观察；不读取 DOM 文本、props、命令参数或结果。页面事实证明已提交内容节点，不证明用户看见/点击、CSS 可见性、Portal 在容器外的内容或客户端未被攻陷。

安全范围：一次性凭据阻止无发放记录的呈现请求、跨 Peer 消费、提交时改包名及重放。Host 核实已安装 Loader 身份，但同一个已认证 Peer 可申请任意允许的条目；它不是恶意客户端的远程渲染证明。真实 Desktop Loader 到 Client fiber 的投影、插件加载顺序和归属/同意/撤回流程必须由 J2S2-USAGE-05 取证，不由这些 fixture 宣称 U1 通过。
