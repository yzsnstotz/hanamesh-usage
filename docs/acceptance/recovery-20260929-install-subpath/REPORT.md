# USAGE rc9 安装子路径归因有限修复

- Origin：hanamesh-usage；基于本机 rc8 commit `73e89961d9962d7236ecebeeb9b84bb61a2b9ecb` 独立 worktree继续，原 main未改，未push/tag/发布。
- 产品消费者 P01 M02 / P04 A02，节点 MAC-COMPOSE / PRODUCT.P04.compose，父冻结计划 SHA256 `bb066b5eaacb59ae214e47d578c2f47c400ff7310b9698df4f797646d1f529b5`；仅父批准的本机修复，不启动全量runner。
- 根因：Loader moduleName为`@hanamesh/app-vibe-trading/dsh`，真实npm包name为`@hanamesh/app-vibe-trading`。原inspectPackage regex拒绝subpath，scan随后又严格name===moduleName，真实Vibe install无法进入事件账本。
- 复现：只读实际p04-acceptance已安装Vibe rc27，root present/subpath unreadable（raw/real-installed-baseline.json），不导入/执行应用。2条真实inspector调用回归RED（raw/red.tap），断言失败不是依赖或语法失败。
- 最小修复：严格npm module specifier语法取得canonical packageName；子路径必须可require.resolve原specifier；只读canonical package.json或既有上溯匹配canonical metadata。scan验证canonical name，事件hanaRef/identity保持实际npm包名；根/子路径切换无重复安装，移除仍发uninstall。
- 不放行URL、绝对/相对路径、空段、./../、编码路径、查询/片段、反斜线；不存在export和metadata错名仍unreadable。没有新增依赖/peer/UI/HTTP/schema，无VIBE/APPHOST/其他origin改动。

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| 真实已安装包metadata只读复验 | root/subpath皆present rc27，不存在export unreadable | raw/real-installed-fixed.json（REAL_INSTALLED_PACKAGE_METADATA，非REAL_UI） |
| target build | PASS Node24.13.1/pnpm10.33.0/TS5.9.3，strict host语义门 | raw/build.log |
| 完整现有tests + 3新增回归 | 114/114 PASS，0skip；包括撤回/崩溃恢复 | raw/tests.tap |
| mutations | 14/14 killed by ERR_ASSERTION，包括canonical退化/不存在subpath误放行 | raw/mutations.log；完整mutants分支外install-subpath-raw/mutations-tap |
| check | PASS，consistency，0经济字段/0 sibling import，pins/lock | raw/check.log |
| detached | 首次继承全局cache导致ENOTCACHED；临时npm cache运行npm ci预热后离线独立repo复制build/check PASS | raw/detached.log，raw/isolated-ci.log，raw/detached-fixed.log |
| npm pack + tar读取 | PASS，44文件，pkg rc9/no deps，peer与rc8完全一致，artifact inventory bytes===source | 本机断言/分支外pack.json |
| git diff --check | PASS | 本机命令 |

产物：`artifacts/hanamesh-usage-0.2.0-rc.9.tgz` SHA256 `57733078cffecd546e6d970a23882fc8b21120f41c8022e0cdeb9eae3560881f`。同产物也在分支根目录。rc8不重封。

返回判定：修复候选 READY_FOR_CHECKPOINT；仅SOURCE/FIXTURE/真实安装metadata只读。完整REAL_UI+REAL_DB安装计分/撤回重启未由本分支执行，不宣称产品PASS/ACCEPTED。父先独立审查，随后CORE34组合与实际profile升级及不同validator真实完整流程。未操作root浏览器/研究runtime/~/.dsh/3080，未使用生产凭据/数据或被测Codex。STATUS归父维护。

## 私有候选分支收口检查（2026-09-29T07:59:33.250151+00:00）

实时只读 `gh api repos/yzsnstotz/hanamesh-usage` 返回 `private:false / visibility:public`；fetch/push URL 都是 `https://github.com/yzsnstotz/hanamesh-usage.git`。本次仅已存在 **私有** origin 的分支 push 获授权，因此立即停 push（`PUBLIC_ORIGIN_PUSH_BLOCKED`），没有 push 尝试、没有改可见性、新远端、release tag 或 publish。

`git ls-remote origin HEAD refs/heads/main refs/heads/codex/usage-withdrawal-retry`：remote HEAD/main 均为 `7b2e79c20b2ff6594f8b88ebd3dc047fbab1dd6d`，候选 branch 当前不存在；本地源代码候选 `9279b8834768248a0b4baf79610a096499abf195` 在 `codex/usage-withdrawal-retry`，写本节前工作树 clean。canonical main 与远端 main相同且clean。仅本地新增本报告收口 commit，源代码与 tgz 不变，报告 commit SHA由父检查点返回记录。详细只读证据见 `raw/remote-visibility-20260929.json`。

按父指令不重复已通过测试；父已独立审查并升级真实profile，validator正从真实入口复验，本分支不据此提升完整产品状态。远端公开可见性仅阻塞候选push，不阻塞已存在的本机profile亲测。
