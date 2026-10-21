# 第 2 段 · Core + Usage 验收说明（Session D，2026-10-15，core 0.3.4 / usage 0.2.0-rc.28）

给 owner 亲手走的步骤：普通 DSH 里装 HanaMesh Core 和 Usage → 在设置里选服务端、看到设备身份和同意开关 → 同意后产生使用记录 → 本机后端收到、不重复 → 撤回后删除 → 积分显示「只累计、暂不可领」。应用库（从市场装普通插件）那一半见 app-host 仓 `docs/acceptance/stage2-app-host.md`（Session E），两份可以在同一个 DSH 里一起走。

全程只用本机后端，不碰线上。**不需要手改任何配置文件。**

## 你需要

| 东西 | 在哪 | 说明 |
|---|---|---|
| 普通 DSH 0.2.1-alpha.2 桌面版 | `~/.cache/hanamesh-runs/stage2-dsh/deepseek-harness-0.2.1-alpha.2-mac-arm64-unsigned.dmg`（sha256 见本文末「文件校验」） | 官方没有发布 0.2.1-alpha.2 的安装包（官方更新源和 GitHub 发布都停在 0.2.0-rc.2；npm 上只有命令行版）。这是从上游 `dsh-v0.2.1-alpha.2` 标签原样构建、不加品牌、未签名的包。拖进「应用程序」会替换你现在的 0.2.0-rc.2（同一个应用）；想留旧版先把旧的改个名。第一次打开要右键「打开」。 |
| Core、Usage 安装包 | `~/.cache/hanamesh-runs/stage2-core-usage/hanamesh-core-0.3.4.tgz`、`hanamesh-usage-0.2.0-rc.28.tgz` | 插件还没上 npm。**装完别删、别挪这两个文件**：之后每次增删插件，DSH 的安装器都会重新读它们。 |
| 本机后端 | `~/work/projects/hanamesh/hanamesh-server`，main `3d8be24`（v0.3.2）或更新 | 需要这一版：它会逐条拒收不在目录里的记录，其余照常写入。 |

## 一、起本机后端（另开一个终端，一直开着）

```
cd ~/work/projects/hanamesh/hanamesh-server
git pull
fnm exec --using=24.13.1 pnpm install --frozen-lockfile --strict-peer-dependencies
fnm exec --using=24.13.1 pnpm dev:local --port 34440 --docker-context colima --postgres-image pgvector/pgvector:pg17 --fixture local-stage1
```
看到 `local_stack_ready` 就好了。Ctrl-C 结束，数据库随之删除。

## 二、装 Core、Usage（一次）

1. 打开一次 DSH（让它建好自己的配置），然后完全退出（菜单 Quit）。
2. 终端执行（上游官方插件命令，DSH 自带）：
   ```
   "/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" plugin --profile desktop add --save-exact \
     ~/.cache/hanamesh-runs/stage2-core-usage/hanamesh-core-0.3.4.tgz \
     ~/.cache/hanamesh-runs/stage2-core-usage/hanamesh-usage-0.2.0-rc.28.tgz
   ```
3. 打开 DSH。**此时什么都不会发出去**：数据授权默认关，关着时 Core 不注册设备、不连任何服务端。

## 三、设置：先选服务端，再看设备身份和同意开关

1. 左下角「Settings」→ 左侧「HanaMesh」。
2. **你会看到**：
   - 「设备身份」：设备 id、「未注册：打开数据授权后注册」，以及「本机共享：DSH 与 HanaMesh 客户端使用同一设备身份」和文件位置。
   - 「服务端」：「当前：https://api.hanamesh.com（出厂默认）」，下面一个地址输入框和「保存」「恢复默认」。
   - 「数据授权」开关**默认关**，旁边「当前：已关闭」，下面一行写明「开启后会立即向 https://api.hanamesh.com（出厂默认服务端）注册本设备并上报使用记录；要换服务端，请先在上方「服务端」里改好再开启。」
3. **先换服务端**：在「服务端」输入框填 `http://127.0.0.1:34440`，点「保存」。**你会看到**「当前：http://127.0.0.1:34440（你设置的）」「出厂默认：https://api.hanamesh.com」，「数据授权」下那行改成向 `http://127.0.0.1:34440（你设置的服务端）`。
   > 顺序很重要：开着数据授权时还是出厂默认，数据会立刻发往线上。

## 四、同意后产生使用记录

1. 打开「数据授权」→「当前：已开启」。几秒后「设备身份」变成「已注册」，「账号」显示「未绑定：绑定后网站才能把本设备的贡献记到你的账号」。
2. 左侧点「HanaMesh 使用记录」。**你会看到**：
   - 「已同意：记录你安装、打开和使用的插件（只有时间、插件名和动作，不含对话内容）。」
   - 记录表（时间 · 插件 · 动作 · 状态）：你装进这个 DSH 的每个插件一行「安装」（Core、Usage，以及按应用库验收装的插件）；**DSH 自带的内置插件不会出现**，被忽略的次数单独写成「已忽略 N 次命令、M 次页面打开……」。
   - 状态列：上报后显示「服务端已收到」。Core、Usage 目前不在本机目录里，显示「未被接收：该插件不在 HanaMesh 目录里，服务端没有接收（不计积分）」——这是如实显示；按已定的方案它们会以「官方」身份收进目录，那之后显示「服务端已收到 · 官方插件 · 不计积分」（等 A2 的服务端那部分上线）。
   - 刚打开的这个页面会让 `hanamesh-usage` 多一行「打开」（点「刷新」可见）。
3. 「使用」= 插件的斜杠命令成功执行。只有你装进来的插件的命令算；DSH 自带命令不算；聊天本身不算（你定的 D）。

## 五、服务端收到、不重复

1. 「HanaMesh 使用记录」页里「查看服务端记录数」后面会直接显示「服务端有本设备的原始记录 N 条」（同意后自动读一次），N 等于表里「服务端已收到」的行数。
2. 完全退出 DSH 再打开，回到这个页面 → **N 不变**（重扫不会造出重复记录；同一条记录重发时服务端回「重复」不再新增，自动测试对本机后端实测过）。

## 六、撤回同意后删除

1. 回「HanaMesh」把「数据授权」关掉。
2. 回「HanaMesh 使用记录」。**你会看到**「已撤回同意，服务端已删除本设备的原始记录 N 条。」，表格为空，顶部变成「未同意：不记录任何使用……」。
3. 点「查看服务端记录数」→「服务端有本设备的原始记录 0 条」。
4. 再打开插件页面、执行插件命令 → 不再新增任何记录。

## 七、积分

1. 把「数据授权」重新打开。装一个在本机目录里的插件：用应用库市场搜 `no-long-sit` 装「dsh-no-long-sit」（或终端 `".../runtime/cli/bin/dsh" plugin --profile desktop add --save-exact dsh-no-long-sit@0.1.3`）。等「HanaMesh 使用记录」里它的「安装」显示「服务端已收到」（上报每分钟一次）。
2. 「Settings → HanaMesh → 我的Hana」。**你会看到**「未绑定：只累计、暂不可领」，以及「dsh-no-long-sit」5 分（本机后端是测试值：安装 5、使用 2、打开 0）。

## 已知限制（如实写明）

- **本机目录里没有能在 0.2.1-alpha.2 上执行斜杠命令的插件**（带命令的 `dsh-offpeak` 只声明到 0.2.0）。「使用」这一步在真 DSH 里只能用你自己装的、带命令的插件验；规则本身在自动测试里覆盖。
- 被宿主拒收的记录不会自动重发；条件满足后（例如插件被收进目录）在「诊断」里手动重发，按原签名原样发送。
- 「官方插件 · 不计积分」要等服务端把官方插件收进目录、并在记录上附说明后才会出现；客户端已按批准的格式实现。

## 文件校验（sha256）

| 文件 | sha256 |
|---|---|
| hanamesh-core-0.3.4.tgz | `154766ebdfcceff624dd1eb13290a709ab52e9e37b58c5eb806640369d4704a2` |
| hanamesh-usage-0.2.0-rc.28.tgz | `0e7bca09e0aaae59d4355f90f0dd6335fb8d1ac7b1d9a93d9268c267c8762a24` |
| deepseek-harness-0.2.1-alpha.2-mac-arm64-unsigned.dmg | （重建中，完成后填入） |
