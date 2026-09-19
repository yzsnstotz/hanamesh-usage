# USAGE-001 · 可选 Cordis 服务必须经 `ctx.get()` 探测

在 DSH 0.1.5-alpha.1 / Cordis 4.0.2 的真实宿主中，直接读取未写入 `inject` 的可选服务属性（例如 `ctx.hanameshCore`）会在插件加载阶段抛出 `cannot get property ... without inject`。fixture 里用普通对象模拟 `ctx` 不会暴露这个宿主约束。

可选依赖不能为了绕过该错误加入强制 `inject`，否则依赖缺席时插件无法降级启动。正确路径是：

- 初始探测使用 `ctx.get('serviceKey')`；
- 服务晚到继续监听 `internal/service`；
- 对返回值做协议版本和方法集合的 duck-type 检查；
- 缺席或不兼容时返回有界 health 状态，不让 `apply` 抛错。

凡修改可选服务接线，除 fixture 外必须在真实 Cordis/DSH 宿主启动一次；一旦候选包已被 `plugin add` 消费，修复后必须按 H-03 升 rc，不能覆盖同版本字节。
