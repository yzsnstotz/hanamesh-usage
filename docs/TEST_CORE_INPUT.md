# 真实Core公开fixture测试输入
本仓测试直接消费`@hanamesh/core/contract/fixtures`或`@hanamesh/core/suite`。完成本仓锁定依赖安装后，用`npm install --no-save --package-lock=false --ignore-scripts --strict-peer-deps <已核SHA的Core正常tgz>`提供开发输入，再跑原测试命令；本轮输入Core0.3.28。正常包由Core目标构建提供，不放入本仓、不复制私有实现、不workspace-link源码。Usage测试改动不进入生产文件，本轮不重新物化Agent。

生产闭包检查先在本仓 frozen 安装上执行；随后注入 Core 正常公开测试输入跑全套/契约/变异。打包前再次 frozen 安装恢复本仓闭包；独立 offline build/check 不执行跨包 fixture 测试。正常消费者另按全部公开 peer 严格安装核对，不放宽闭包断言。
