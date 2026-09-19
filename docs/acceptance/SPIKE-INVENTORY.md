结论：loader

# DSH 0.1.5-alpha.1 plugin inventory spike

## 范围与判定

阶段 3 先做静态 SOURCE 调查，阶段 4 已在隔离真实 DSH 0.1.5-alpha.1 profile 复核返回形状与重启行为。SOURCE 与 REAL_HOST 证据分开记录，不以静态源码冒充真实宿主。

选择 `loader`，因为宿主候选 `@deepseek-ai/dsh-host-plugin-inventory` 的 `list()` 本身逐次遍历 `ctx.loader.entries()`，只返回 Loader 条目与 fiber 状态；它不返回包版本、未进入 Loader 的已安装依赖、历史快照或 install/uninstall 事件。因此它没有提供本实现需要且 Loader 不具备的事实。

## 搜索命中

钉版 runtime `hanamesh-dsh-runtime/runtime/node_modules/@deepseek-ai/` 中命中：

- `dsh-client-ui-settings-plugin-inventory`：客户端设置 UI，不是宿主事实服务。
- `dsh-host-plugin-inventory`：宿主远程投影，版本 `0.1.5-alpha.1`。
- `dsh-plugin-package-inventory-deepseek`：为官方 DeepSeek 请求生成 active Loader-backed 包清单；类型注释明确排除 installed dependencies 与无 Loader provenance 的 fiber，不适合作为安装历史源。

仓内 vendored `docs/contracts/host-api/**/lib/*.d.ts` 没有独立 plugin-inventory 契约；Cordis 公共契约只确认 `ctx.get(name)` 可在不声明 inject 的情况下读取可选服务。

## 候选宿主服务的原文事实

来源：钉版 runtime 的 `@deepseek-ai/dsh-host-plugin-inventory/lib/types/index.d.ts` 与 `lib/types/types.d.ts`，以及同版本上游 `packages/host/plugin-inventory/src/index.ts`。

```ts
export declare class PluginInventoryGateway extends TypertRemoteService {
  static inject: string[];
  constructor(ctx: Context);
  list(): Promise<PluginInventorySnapshot>;
}
```

实现中的精确注册与注入：

```ts
static inject = ['loader']
super(ctx, 'pluginInventory')
@Remote('list')
```

返回条目形状：

```ts
interface PluginInventoryEntry {
  readonly entryId: PluginEntryId;
  readonly moduleName: string;
  readonly enabled: boolean;
  readonly fiberPhase: 'pending'|'loading'|'active'|'failed'|'unloading'|null;
}
```

实现的 `list()` 逐条读取 `this.ctx.loader.entries()`；未发现 `plugin/installed`、`plugin/removed`、`inventory/update` 或 `inventory/changed` 事件。服务也不返回 `version`，所以仍需 `inspectPackage()`。

## 采用的公共面

- 主数据源：必需注入的 `ctx.loader.entries()`。
- 包信息：resolve-without-import 读取目标包 `package.json`，不执行被观察插件代码。
- 快照：`hanamesh_usage_events.inventory.last`。
- 事件：跨扫描比较产生确定性的 `install`/`uninstall`；实时 add/remove 事件不可得。
- health：`source:'loader'`；`detail:{package:'@deepseek-ai/cordis',serviceKey:'loader',methods:['entries']}`。
- 可选 `pluginInventory` 不进入 inject，也不作为主数据源，避免增加一个不更强的生命周期事实。

## 证据状态

| 检查 | 状态 | 证据 |
|---|---|---|
| 包与契约搜索 | PASS | SOURCE，钉版 runtime 与上游源码 |
| 候选服务键/方法/返回类型 | PASS | SOURCE，`pluginInventory.list()` |
| 是否优于 Loader | NO | SOURCE：仍读 Loader、无版本/未加载依赖/安装历史/动作事件 |
| 本实现 Loader 扫描与跨启动比较 | PASS | FIXTURE，`tests/inventory.test.mjs` 与 `inventory-smoke.mjs` |
| 本次隔离 DSH 返回形状 | PASS | REAL_HOST：`pluginInventory.list()` 返回顶层 `agentPresets/entries`；159 个 entry 的键为 `enabled/entryId/fiberPhase/moduleName`，见 `p2-2026-09-19/U20-inventory-probe.json` |
| `dsh plugin add/remove` 与重启比对 | PASS | REAL_HOST：最终 rc.4 的 bundle add/启动、rc.4 自包含 suite remove 恢复均通过；稳定重启事件身份/nonce/状态摘要不变，见 `U23-*`、`U28-*`、`U31-mutual-exclusion.txt` |

本结论不修改或 patch DSH 上游。
