# 真实Core公开fixture测试输入
本仓测试直接消费`@hanamesh/core/contract/fixtures`或`@hanamesh/core/suite`。完成本仓锁定依赖安装后，用`npm install --no-save --package-lock=false --ignore-scripts --strict-peer-deps <已核SHA的Core正常tgz>`提供开发输入，再跑原测试命令；本轮输入Core0.3.28。正常包由Core目标构建提供，不放入本仓、不复制私有实现、不workspace-link源码。Usage测试改动不进入生产文件，本轮不重新物化Agent。
