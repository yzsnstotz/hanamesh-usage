# 历史存储升级修复 · rc.32 · 2026-10-16

范围：官方 DeepSeek Harness 0.2.0-rc.2 已装 Core0.3.7 / Usagerc.31 / AppHost0.6.2，设备注册成功但 Usage 未加载。此前全新配置验证没有覆盖这条历史升级路径；其通过不代表本缺陷已覆盖。

## 真实异常与根因

只把 owner 明确授权的五个 storage 文件复制到权限0700的本机临时配置。未修改 owner 的 `~/.dsh`。隔离副本使用官方未改动的桌面与随包 CLI，独立 HOME/DSH_HOME/Electron user-data、最小环境和 mock keychain。副本禁用后端、远程目录及外部浏览器；未连接34440/48606/api.hanamesh.com。

真实 Loader 的公开 `Fiber.await()` 抛出：

```text
DomainError [invalid-record]: domain 'hanamesh_usage_events': stored global does not match its schema
  at parseRecord (.../@deepseek-ai/dsh-storage-domain/lib/index.js:424:9)
  at DomainFacility.open (.../@deepseek-ai/dsh-storage-domain/lib/index.js:383:106)
  at async Fiber.<anonymous> (<isolated>/node_modules/hanamesh-usage/lib/host/index.js:67:21)
```

9月的11条 `records` 均可读；176条事件中173条 sent、3条 rejected。恰有3条 rejected 的 nonce 为 `_` / `-` 开头的规范16字节 base64url（22字符）。在内存诊断中只替换 nonce 即通过原校验；缺省 receipt 是合法可选字段，并非原因。未打印或保存事件原文、设备密钥、完整 nonce。

历史生成器允许完整 base64url；`1cc8e6030884b53c14e453de0cef0fecf476cb26` 收紧新事件 nonce 至服务端 token 语法并修正新生成器，但存储读取复用了新上传校验，导致旧终态记录令整个 domain 拒绝打开。旧 records、注册状态和 AppHost 不是本次启动失败根因。

## 修复边界

- 存储读取单独接纳规范历史 nonce；其余字段、闭合 DTO 与当前规则不放松。新创建和 wire 上传继续使用严格校验。
- 已发送、重复、已拒绝记录保留原 eventId、nonce、签名、回执与终态；不重新签名、不重传 sent。
- 若有不能上传的旧 pending，启动前先等待持久化为本机 `LEGACY_NONCE_UNSUPPORTED`，再公布服务、启动发送器。界面明确保留本机、需再次使用插件产生新记录；不冒充服务端拒收。写盘失败仍拒绝启动并关闭 domain。
- 独立审阅发现旧 nonce 的 host-rejected 记录可被手动补报重新变为 pending，从而阻塞新发送。rc.32 在持久化前拒绝重新打开它，保留原终态；回归验证旧补报拒绝后新记录仍正常上传。源代码只读复核确认该项关闭。

## 最终验证

目标 Node24.13.1 / pnpm10.33.0 / TS5.9.3 build 与 check 通过；完整348项：346通过、2可选真实后端测试跳过。新增历史兼容/真实签名保留/严格 wire/启动持久化/失败关闭/旧补报不阻塞6项通过，有实际红测。28项实际编译代码变异均由断言检出，包含4项升级边界。最终 tgz 在全新消费者 strict peers 安装、skipLibCheck:false 类型检查与公开入口导入通过。

官方 rc.2 桌面，先装 Core0.3.8 + rc.31，历史副本真实失败；同一隔离配置通过官方 CLI 原地装 rc.32，再重启：

- Usage active、Core 自动 repair → normal；受保护资源仍逐次检查。
- 11条旧 records 与176条旧事件逐条保持不变（含173 sent / 3 rejected），不是仅比较数量。
- 当前设备面板可读全部历史，签名校验成功；新安装库存生成4条本机事件。
- 实际 Settings → HanaMesh 使用记录呈现历史表，新增1条真实页面 open，有签名、pending；未调用模型、未伪造 use。
- 再次完整重启仍 normal，原历史继续逐条不变。无后端时 offline；不宣称 owner 后端接收、计分或 ACCEPTED。

本轮未重跑 alpha.2 CLI/web 实际宿主；此前兼容结果见 dsh-rc2-rc31.md。当前包已在精确 alpha.2 公开依赖消费者检查，但这不是 alpha 桌面实测。

两包、SHA256SUMS、脱敏执行收据位于 `/Users/yzliu/.cache/hanamesh-runs/session-g-upgrade-20261016/`。临时私密副本与桌面进程均在 finally 清理；仅保留计数、布尔比较、稳定错误栈和组件区域截图。owner 正在使用的宿主会持续写自己的健康文件，测试未冻结或修改它；源文件末尾哈希只记录观察，不能把并发变化归因于测试。

owner 已装 rc.31 的升级与 repair 恢复步骤见 Core `docs/acceptance/OWNER-LEGACY-UPGRADE-20261016.md`。AppHost0.6.2 本轮未改。无推送、发布或部署。
