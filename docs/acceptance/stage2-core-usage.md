# 第 2 段 · Core + Usage 验收说明（Session D，2026-10-15）

给 owner 亲手走的步骤：普通 DSH 里装 HanaMesh Core 和 Usage → 看到设备身份与同意开关 → 同意后产生使用记录 → 本机后端收到、不重复 → 撤回后删除 → 积分显示「只累计、暂不可领」。应用库（从市场装普通插件）那一半见 app-host 仓 `docs/acceptance/stage2-app-host.md`（Session E），两份可以在同一个 DSH 里一起走。

全程只用本机后端，不碰线上。

## 你需要

| 东西 | 在哪 | 说明 |
|---|---|---|
| 普通 DSH 0.2.1-alpha.2 桌面版 | `~/.cache/hanamesh-runs/stage2-dsh/deepseek-harness-0.2.1-alpha.2-mac-arm64-unsigned.dmg`（sha256 `c89f3dce3fcd15b0dedb5312d15d34a9da2d1df5ed12bc9d8a721343c1b5b5f2`） | 官方没有发布 0.2.1-alpha.2 的安装包（官方更新源和 GitHub 发布都停在 0.2.0-rc.2；npm 上只有命令行版）。这是从上游 `dsh-v0.2.1-alpha.2` 标签原样构建、不加品牌、未签名的包。拖进「应用程序」会替换你现在的 0.2.0-rc.2（同一个应用）；想留旧版先把旧的改个名。第一次打开要右键「打开」。 |
| Core、Usage 安装包 | `~/.cache/hanamesh-runs/stage2-core-usage/hanamesh-core-0.3.3.tgz`、`hanamesh-usage-0.2.0-rc.27.tgz` | 插件还没上 npm。**装完别删、别挪这两个文件**：之后每次增删插件，DSH 的安装器都会重新读它们。 |
| 本机后端 | `~/work/projects/hanamesh/hanamesh-server` | 起法见下面第一步。 |

## 一、起本机后端（另开一个终端，一直开着）

```
cd ~/work/projects/hanamesh/hanamesh-server
fnm exec --using=24.13.1 pnpm install --frozen-lockfile --strict-peer-dependencies   # 第一次才需要
fnm exec --using=24.13.1 pnpm dev:local --port 34440 --docker-context colima --postgres-image pgvector/pgvector:pg17 --fixture local-stage1
```
看到 `local_stack_ready` 就好了。Ctrl-C 结束，数据库随之删除。

> 需要后端带上 Session A2 的「逐条拒收」（server-usage 0.3.2）。没带的话，只要一批里有一条记录的插件不在目录里（例如 Core、Usage 自己），整批都会被拒，「使用记录」里会显示「服务端收到了，但处理这批记录时出错，整批没有写入」。这是后端问题，不是你操作错了。

## 二、把 Core、Usage 装进 DSH，并指向本机后端（一次）

顺序很重要：**先写好「指向本机后端」，再打开装了 Core 的 DSH**。Core 出厂指向线上 `api.hanamesh.com`，一启动就会向它注册设备。

1. 打开一次 DSH（让它建好自己的配置），然后完全退出（菜单 Quit）。
2. 终端执行（上游官方插件命令，DSH 自带）：
   ```
   "/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" plugin --profile desktop add --save-exact \
     ~/.cache/hanamesh-runs/stage2-core-usage/hanamesh-core-0.3.3.tgz \
     ~/.cache/hanamesh-runs/stage2-core-usage/hanamesh-usage-0.2.0-rc.27.tgz
   ```
3. 用文本编辑器打开 `~/.dsh/profiles/desktop/cordis.patch.yml`。如果内容只有注释和 `[]`，把 `[]` 换成下面这段；如果已经有别的条目，把这段加在末尾（每条以 `- id:` 开头）：
   ```yaml
   - id: hanamesh-core
     config:
       serverOrigin: http://127.0.0.1:34440
       websiteOrigin: null
       allowSystemBrowser: false
   ```
   （`websiteOrigin` 是绑定网站用的，属于第 3 段；本段不用。）
4. 再打开 DSH。

## 三、设置：设备身份和同意开关

1. 左下角「Settings」→ 左侧「HanaMesh」。
2. **你会看到**：
   - 「设备身份」：设备 id（一串字母数字）、「注册：已注册」，以及「本机共享：DSH 与 HanaMesh 客户端使用同一设备身份」和文件位置。
   - 「数据授权」开关，**默认关**，旁边写「当前：已关闭」。
   - 「账号」：「未绑定：绑定后网站才能把本设备的贡献记到你的账号」。
   - 「HanaMesh套件」：「使用记录：已安装 0.2.0-rc.27」。

## 四、同意后产生使用记录

1. 打开「数据授权」开关 → 显示「当前：已开启」。
2. 左侧点「HanaMesh 使用记录」。
3. **你会看到**：
   - 顶部「已同意：记录你安装、打开和使用的插件（只有时间、插件名和动作，不含对话内容）。」
   - 记录表（时间 · 插件 · 动作 · 状态）：你装进这个 DSH 的每个插件一行「安装」（Core、Usage，以及按应用库验收装的插件）；**DSH 自带的内置插件不会出现**。
   - 你刚打开的这个页面会让 `hanamesh-usage` 多一行「打开」（点「刷新」可见）。
   - 状态列：上报成功后显示「服务端已收到」；插件不在 HanaMesh 目录里的记录显示「未被接收：该插件不在 HanaMesh 目录里，服务端没有接收（不计积分）」。本机后端的目录是公开市场的 25 个插件快照，**不含 Core、Usage、应用库本身**，所以它们的记录会显示这条原因——这是如实显示，不是故障。
4. 「使用」= 插件的斜杠命令成功执行。只有你装进来的插件的命令算；DSH 自带命令不算；聊天本身不算（你定的 D）。

## 五、服务端收到、不重复

1. 在「HanaMesh 使用记录」点「查看服务端记录数」→ **你会看到**「服务端有本设备的原始记录 N 条」，N 等于表里「服务端已收到」的行数。
2. 完全退出 DSH 再打开，回到这个页面再点一次 → **N 不变**（重新扫描不会造出重复记录；同一条记录重发时服务端回「重复」不再新增，这条在自动测试里对本机后端实测过）。

## 六、撤回同意后删除

1. 回「HanaMesh」把「数据授权」关掉。
2. 回「HanaMesh 使用记录」。**你会看到**「已撤回同意，服务端已删除本设备的原始记录 N 条。」，表格为空，顶部变成「未同意：不记录任何使用……」。
3. 点「查看服务端记录数」→「服务端有本设备的原始记录 0 条」。
4. 再打开别的插件页面、执行插件命令 → 不再新增任何记录。

## 七、积分

1. 先把「数据授权」重新打开。装一个在本机目录里的插件：用应用库市场搜 `no-long-sit` 装「dsh-no-long-sit」（或终端 `".../runtime/cli/bin/dsh" plugin --profile desktop add --save-exact dsh-no-long-sit@0.1.3`）。等「HanaMesh 使用记录」里它的「安装」显示「服务端已收到」（上报每分钟一次）。
2. 「Settings → HanaMesh →  我的Hana」。**你会看到**「未绑定：只累计、暂不可领」，以及每个插件的分（本机后端是测试值：安装 5 分、使用 2 分、打开 0 分）。没有目录内插件的记录时显示「还没有分」。

## 已知限制（如实写明）

- **「指向本机后端」要手改文件**：Core 的服务端地址目前只能写在 profile 配置里，设置页只读显示，界面内还不能改。
- **本机目录里没有能在 0.2.1-alpha.2 上执行斜杠命令的插件**：快照里带命令的（如 `dsh-offpeak`）声明只支持到 0.2.0，需要版本豁免才能装。所以「使用」这一步在真 DSH 里只能用你自己装的、带命令的插件验；规则本身（只算你装的插件的成功命令）在自动测试里覆盖。
- **Core、Usage、应用库不在目录里**，它们自己的记录不会被接收、不计分（见第四步）。要不要把 HanaMesh 自己的插件也收进目录，由你定。
- **被拒的记录不会自动重发**（服务端约定不要循环重发）；目录收录后重发入口在「诊断」里，目前只对「等待上报」的记录开放。
- 后端没带逐条拒收时的整批失败，见第一步的提示。
