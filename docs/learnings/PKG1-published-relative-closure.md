# PKG1 · 已发布包的相对依赖闭包

日期：2026-11-22；同类问题再犯：AppHost 0.6.9 的默认 ledger 私有路径问题后，0.6.29 的 library 默认 provider 路径再次遗漏；Usage rc.19 的工具依赖未列 files。

现象：DSH 部署闭包门 PLUGIN_DEPLOY_RELATIVE_MISSING。AppHost 的 build 迁移到 bundled 公开 lib-provision 时漏改 library/install 默认 import；Usage files 漏 tools/native-helper.mjs。

修复：AppHost 保留调用并绑定公开 provider；Usage 保留工具并打入实际 helper。发布前 `npm run verify:closure` 正常 npm pack 后解包，用既有 TypeScript parser 检查所有 JS/MJS/CJS 的静态相对 import/re-export、字面量动态 import、require/require.resolve（含常量拼接）；缺文件或越过包根即失败。不只检查入口可达树。ESM 不猜扩展名，CJS 遵循 Node resolver。非字面量运行时表达式不属于静态依赖证明。

落地：scripts/verify-pack-closure.mjs、tests/pack-closure.test.mjs、package.json 发布/验证入口及 .github/workflows/pack-closure.yml。

状态：修复候选；待独立 R 审查及最终 SHA 完整门、tag、发布读回。证据根：/Users/leoventory/.cache/hanamesh-runs/PKG1-seed-publish-closure-20261122；原包扫描见 published/closure-report.json，根因提交见 DESIGN.md。
