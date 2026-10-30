# 真实Core公开fixture测试输入

本仓测试消费 `@hanamesh/core/contract/fixtures`、`@hanamesh/core/suite`，本轮固定 Core0.3.28 正常包。先在本仓 frozen 安装上完成生产 build/check；在独立 provider consumer 中显式声明已核 SHA 的正常 Core tgz 及其固定公开 peer，严格安装并冻结读回，将已安装的公开 Core 包连接到测试 node_modules 解析路径后跑全套/契约/变异。打包前再次 frozen 安装恢复本仓闭包；不放宽闭包断言。

Core 正常包不放入本仓，不复制私有规则，不链接源码。独立 offline build/check 不执行跨包 fixture 测试。正常 Usage 消费者另按全部公开 peer 严格安装核对。修改仅测试/开发核对，生产包须证明与原 rc.15 字节相同；本轮不重新物化 Agent。
