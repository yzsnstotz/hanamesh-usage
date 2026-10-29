# HanaMesh Agent 0.2.4

使用 Claude Code / Codex 原生插件市场安装。宿主允许执行后会以带锁的独立后台进程只下载本架构固定Node24.13.1官方tar.xz并校验SHA（macOS arm64/x64）；启动入口立即返回。运行环境就绪后才开始仅本机的最小使用记录；不需终端setup、connect或会话内授权。Codex须先由本人审核并Trust hooks，Trust前不记录且无法发hook提示；安装详情提前说明此点。其他平台具名unsupported，未验证。

记录插件、功能、时间、成败、渠道，不保存对话、工具输入输出正文、文件或凭据。记录滚动保留30天，超期在下次插件执行时清除。网站同意绑定前不上传使用记录；自动准备的运行时下载与设备公钥等注册/绑定准备信息不含本机使用记录。新会话最多每天每渠道提醒一次，含候选待上传条数、最早期限、过期不计分和绑定链接，7天/1天加强但不增频。

在插件hm-setup查看只读状态及真实链接，去HanaMesh注册/登录，点一次「同意并绑定」。插件核实服务端提交审计与设备绑定后才上传，并按真实发生时间补报窗口内历史；不把绑定或已接收等同计分。旧终端granted继续有效，不补造网站审计。DSH本期仍按原同意弹窗。

可在宿主原生插件管理中禁用以停止执行。禁用不等于清除本机记录/远端撤回；没有真实回调控件的CLI/详情页目前无法提供一键清理，不能用文本假按钮替代。维护诊断保留withdraw入口，经Core先关闭再清本机并取得原代次提交墓碑；不是普通开通的必需步骤。MCP只暴露只读hanamesh_status，模型不能授予上传或替本人Trust。

正式地址对随包固定api.hanamesh.com与market.hanamesh.com；本地/staging仅维护者用完整显式config覆盖，不猜端口或缺项回落。运行时不查PATH、不使用宿主Node25；缓存篡改/下载失败具名报错，保留真实stderr。发布前隐私文字仍须专业审阅；本候选不npm/部署，不声称所有宿主原生界面已验。

运行环境准备期为RUNTIME_PREPARING，status提供实际已下载字节、总字节及进度；SessionStart只提示一行「HanaMesh正在准备运行环境（约1分钟），完成后开始本机记录」。这是预计时间，不是假完成。准备期间调用不读取、不记录、不补录；跨越准备窗口而未观察到就绪后Pre的迟到Post也不补记。MCP准备期先完成协议握手并返回具名未就绪，完成后自动交接正常Node服务，无需重启/终端命令。

下载失败具名显示，当前会话不循环重试；下个新SessionStart最多自动发起一次。后台进程有限且只有一个，不是常驻服务。会话标识仅在SessionStart取摘要作重试去重；其他hook载荷不读取，不用shell解析工具内容落盘。已关闭状态在就绪后仍由原Core决定，不被准备过程重新开启。

已校验的 Node 发布后若准备者中断，后续入口仅在准备锁空闲时收口为 READY；活动准备者持锁时仍不记录，status如实显示未就绪。恢复不重新下载、不补录准备期调用，主动关闭保持关闭。

Codex 远程插件识别（统一组合候选，待独审与Host集成）：仅支持已实测的 codex-cli 0.165.0 与 schema1 安装 marker。布局依据公开源码固定 c92700d2993707ee16eb63b35a1cdd7fcc563f69 的 codex-rs/core/src/plugins/installed.rs，并以本机隔离 CLI 实装核对。marker 在 plugins/cache/openai-curated-remote/<name>/.codex-remote-plugin-install.json，只含 schema_version/remote_plugin_id；版本目录和启用状态取官方只读 plugin list --json -m openai-curated-remote，不能由 marker 或 config.toml 推导。

后台仅从公开目录与登记来源取得固定 Git 文件清单，逐 blob/执行位核完整 contentSha256；hook 只读取该清单中的普通静态文件。仅对 .codex-plugin/plugin.json 支持已实测的相同字段和值、双空格缩进加尾换行格式化；其它内容逐字核同。未证明的 app 物化、未知 CLI/schema、缺来源/启用观察、ID/版本/内容不匹配都具名不计分；CLI 失败不关闭其它本地插件路径。状态工具的 remoteInstallations.diagnostics 给出原因，无原始错误、凭据、后端下载 URL 或私有路径。

远程本机 pluginId 固定为 <name>@openai-curated-remote，用此键查收录目录的 hanaRef。现行 v2 十字段事件和九字段签名不变，pluginId/remote ID/版本摘要仅留本机；仅实际调用产生 use，并沿原规则补首次 install，不因安装或缓存存在造事件。完整安装验证与调用成败是两道独立条件：countUnconfirmedCalls 不会放行未验证的安装。已有完整证明的观察可在重新收录且身份/版本/摘要不变时按原30天窗口补报；未取得内容证明的旧观察保持本地 unverified，不能用后来安装内容补造过去的证据。网站同意绑定仍是上传前置；同意前的公开目录/Git读取不包含本机使用记录。
