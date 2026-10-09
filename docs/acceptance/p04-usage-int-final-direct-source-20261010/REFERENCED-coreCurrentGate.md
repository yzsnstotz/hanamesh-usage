# MERGE-CORE-MAIN-01 REPORT

2026-10-09 JST · origin `hanamesh-core` · 唯一writer `01a11f26-ea25-7492-8534-0f54fba04d5b`。

**DELIVERED：当前Core全仓私有依赖/main收口已完成；Identity rc.3新增17 named项已逐项核适用，4项实际或strict类型通过、13项N/A。** 原未变门按字节证据保留，不等Identity正式0.3.0，不宣布owner ACCEPTED或Web/钱包/真实产品PASS。

- 改了什么：仅隔离 `contract-tests/identity` 的正常源范围/工具生成锁、named类型探针和actual Core绑定URL验证；无Core业务/运行依赖/协议/config变更，无DTO声明副本。
- git：`codex/merge-core-main-01` / 私有main **`2a210b580e1d61842a8e0dc77d49ad5147e8db6a`** 已普通push，**工作树干净**。本次提交1a8cf87，普通merge父7b287387/1a8cf87。
- 构建清理：见 `CLEANUP.json`，本卡根/closure实存一级条目全覆盖，旧归档指针准确路径补记；证据/旧FAIL/接受入口保。
- 自测：新normal strict/frozen安装、2/2 actual/range、公开strict TS、browser DOM strict/listFiles均exit0；详下节，未重跑未变全业务门。
- 试用入口已起：N/A（内部合约收口、owner不测）；原P04产品入口和接受保，本轮无GUI。
- 合约一致性：Identity **v0.3.0-rc.3** Core适用device/named消费通过；Devkit **v0.2.0**、Core **v0.3.2** 已过门保。
- 合约变更请求：`CR-CORE-HTTP-URL-SUPPLY-01.md` 已按rc.3供给复核，实际绑定query已有Identity合法named来源；额外全HTTP供给不冒已实施，不作本轮新增硬前件，交PM按证据收紧原宽请求。
- 整合卡改动分类：不适用。

Core已发 **v0.3.2** 仍指 **00b936fcff8c3bff462fcfa14ce4f1729704f215**，不是最新main；其正常包104文件/SHA **8aab4cb8ae68d9299c4f1b736390f94f45e909f26ed29a765335a9fa273ec1f0** 保。main至tag差异仅六个未随包contract-tests文件，根manifest/lock、lib、schema与公开业务字节不变；沿此前current-main normal pack整个tgz等正式包证据保留，不为测试输入再造Core版本/tag。

## 当前main完整依赖/包闭包

沿前两轮14个package.json全仓审计，本轮记录14manifest完整dependency/dev/peer/optional/files/scripts/overrides，见 `evidence/identity-rc3/identity-rc3-manifest-inventory.json`；此前manifest-before/after及历史vendor/失败证据保。只改Core，不读/改邻源码，不新增runtime dependency/peer/config。

| 当前消费位置 | 真实来源/解析 | 当前结果/适用性 |
| --- | --- | --- |
| 根Devkit devDependency | `git+https://github.com/yzsnstotz/hanamesh-server-shared.git#semver:^0.2.0&path:/packages/devkit` → 8f9bcc69/0.2.0 | 既有strict/frozen与public供给suitePASS保；Node24.13.1/pnpm10.33。root runtime/publicpeer/optionalMeta无Devkit，src/lib/types/contract/profile无运行import |
| 隔离测试包Identity dependency | 上述正常^0.3.0-rc.3 → 1d8f59f9/0.3.0-rc.3 | 正常strict安装+frozen exit0，唯一active Identity版本；actual Core设备HTTP fixture/schema/type门通过，不等正式0.3.0 |
| 间接Identity旧Devkit声明 | 正常rc.3安装manifest已无Devkit peer/optionalMeta；其devDependency为相同Devkit Git子包范围 | 子包lock已无rc11/Devkit旧peer；active图私有Devkit版本0，无override/多版本/peer bypass；源candidate package88/88文件等正式源包 |
| 根其他公开peer/dev/overrides | Cordis4.0.4、DSH rc2、React18.3.1、Zod4.5.4、TS5.9.3等原字段保 | 原strict正常21包Core消费与JS/strict TS保；不将浏览器根声明失败改成publicpeer workaround |
| UI Kit/Devkit历史私有vendor | 原无引用UI Kit tgz/deps记录、Devkit rc1 tgz/SHA已去 | 原件/SHA、旧接受枝和失败不删；不以副本作权威 |
| 11 vendor/host-api manifests | 官方public旧类型快照，非活动子包且不随Core包 | 94输入原门保；独立install N/A，actualbuild/types走正常官方包 |
| vendor/semver manifest | 已有public SemVer7.7.2 MIT | 原运行范围库/SHA保，非私有合同副本 |
| profile AppHost名字/范围与历史artifacts/docs收据 | 原overlay/HTTP元数据与旧自产包/锁 | 无三插件import、无新的私有活动声明；历史不作当前源权威，不清掉已接受/rollback |

根runtime dependencies0，无活动workspace/commit/local-file私有钉；根Devkit与隔离Identity均是合法source范围，lock由包管理器实际生成。许可原逐项 `identity-rc2-licenses.json` 保留；本轮唯一更新Identity 0.3.0-rc.3、UNLICENSED、正常私有Git、仅开发contract消费，其余闭包的名称/协议/来源/用途未变；Core MIT/Identity UNLICENSED仅私有工程消费，不公共发布。


## Identity rc.3正常消费与17项适用矩阵

合法说明符 **`git+https://github.com/yzsnstotz/hanamesh-server-identity.git#semver:^0.3.0-rc.3`**，包管理器实际解析source/main/tag **`1d8f59f9b39e1810a38ecb860e7ac4627dd01c2c`**。strict安装及frozen均exit0，lock不漂，无alias/伪root/手填SHA/peer bypass；最新 `pnpm list --depth 0 --json` 只有实际Identity rc.3。rc.2、rc.1失败/历史回执不当当前安装图。

源normal pack **127488 bytes / 88成员 / SHA c2a00e696827d42ee9258b0641f43124a7dcbb90d72d254a70b887293073be46**，含SQL，正常Git安装88/88成员逐byte相同。对rc.2 **82/88不变**，六个差异是package.json、CHANGELOG、CONTRACT.md、contracts.d.ts、contract.d.ts、contract.js的新增DTO元数据；auth/device/wallet/HTTP实现、schema/SQL和fixture/suite函数均不变。源钱包门保留，不让Core重复整轮。

| 新named项 | Core实际消费与结果 |
| --- | --- |
| `DeviceChallengeInput` | 适用：Core register/bind 请求。公开purpose仅register|bind；bind实际请求/source schema通过，register原运行门保，strict named类型通过。 |
| `DeviceRegisterInput` | 适用：Core实际registerDevice参数组成注册body；strict named类型通过，原actual注册/source schema门按未变字节保。 |
| `DeviceRegisterResponse` | 适用：Core registerDevice实际返回与源named类型双向赋值通过；原实际返回/source schema门保。 |
| `DeviceBindInput` | 适用：Core bindLink实际URL的deviceId/nonce/signature满足Identity接收端named schema；两个公开类型出口严格导入通过。不是Core调用bind API，也不是Web actual。 |
| `DeviceListResponse` | N/A：Core无该端点请求/响应消费；不为消除N/A在Core增加调用或副本。 |
| `EmailRequestInput` | N/A：Core无该端点请求/响应消费；不为消除N/A在Core增加调用或副本。 |
| `EmailRequestResponse` | N/A：Core无该端点请求/响应消费；不为消除N/A在Core增加调用或副本。 |
| `EmailVerifyInput` | N/A：Core无该端点请求/响应消费；不为消除N/A在Core增加调用或副本。 |
| `EmptyObject` | N/A：Core无该端点请求/响应消费；不为消除N/A在Core增加调用或副本。 |
| `GithubLinkInput` | N/A：Core无该端点请求/响应消费；不为消除N/A在Core增加调用或副本。 |
| `GithubUnlinkResponse` | N/A：Core无该端点请求/响应消费；不为消除N/A在Core增加调用或副本。 |
| `MagicLinkInput` | N/A：Core无该端点请求/响应消费；不为消除N/A在Core增加调用或副本。 |
| `RedirectResponse` | N/A：Core无该端点请求/响应消费；不为消除N/A在Core增加调用或副本。 |
| `SignInInput` | N/A：Core无该端点请求/响应消费；不为消除N/A在Core增加调用或副本。 |
| `SignUpInput` | N/A：Core无该端点请求/响应消费；不为消除N/A在Core增加调用或副本。 |
| `SocialSignInInput` | N/A：Core无该端点请求/响应消费；不为消除N/A在Core增加调用或副本。 |
| `WalletListResponse` | N/A：Core无该端点请求/响应消费；不为消除N/A在Core增加调用或副本。 |

实际新增门运行真正 `SessionController.bindLink()`、Core device key与memoryStore，经显式fixture fetcher调用正常installed Identity challenge fixture；请求purpose=bind通过源DeviceChallengeInput，返回通过DeviceChallengeDTO。实际生成 `/me/bind` URL的三个query字段通过源DeviceBindInput schema、deviceId等Core实际deviceId，共一次fixture请求。测试范围2/2包括published-source assertion；没有真实网络/账号绑定或Web consumer。

`public-contracts.ts` 正常导入源named类型并检查真实Core registration参数/返回双向赋值。`browser-http-types.ts` 从Identity `/contracts`和`/contract` 导入四个适用named类型；TS5.9.3、types:[]、ES2022/DOM/DOM.Iterable、Bundler、strict、skipLibCheck:false。listFiles非标准库只三份Identity d.ts和probe，无Node/Cordis/DSH/framework全局，无复制DTO、cast或路径映射。

原rc.2 actual注册/签名/replay/wire **3/3保留，NOT_RERUN**；旧DeviceLabelDTO/DeviceChallengeDTO/DeviceAuthHeaders消费仍保。wallet challenge/bind/listOwn/getBinding、全局双向唯一/真实PG并发、trusted principal所有权与完整IdentityServices ABI/钱包unique suite **Core N/A**：Core没有这些调用，不在邻层实现钱包授权。可立即将本Core候选actual回执交源formal；未来formal只做必要范围核验，不反向等待。

## 已有Core浏览器出口与原CR复核

此前正常Core0.3.2包/browser证据保于 `evidence/public-types-identity-rc2`：`hanamesh-core/contract` 的SessionSnapshot等类型、schema JSON及fixtures/suite/client的type-only声明在同等无Node DOM严格配置通过。Web deviceId可派生 `SessionSnapshot['deviceId']`；当前绑定提交/query可用接收端Identity DeviceBindInput，不新增Core协议副本。旧Core包具名CoreBindLinkQuery/Response缺失的负向探针exit2原件保留，不能改写为已导出。

Core根type入口仍是DSH插件声明；旧browser探针 **FAIL exit2**（node:http/Disposable），不是浏览器type入口。fixtures/suite运行JS仍需Node且是Services ABI，不冒source纯HTTP向量；Web纯HTTP/URL该ABI **N/A**。Core POST bind-link response不是Web直接消费；完整HTTP/state wrapper不由SessionSnapshot冒充。新actual URL门不等于全HTTP-only suite已发布。原宽CR历史存 `CR-CORE-HTTP-URL-SUPPLY-01-HISTORY.md`，当前精确复核交PM，不改CARD/状态/规划，不等待Web产品/平台本人门。

## 完成判据逐条与未跑项

1. **PASS**：全仓14manifest/root及隔离child dependency/dev/peer/optional/files/scripts/overrides审计已齐，fresh库存附本次receipt；旧vendor/活动声明/历史差别逐项保。
2. **PASS**：无活动私有合同副本、commit/workspace/file旧钉；Devkit合法Git子包范围、Identity合法rc.3范围及正常生成lock、实际peer/provider版本闭合。
3. **PASS（适用范围）**：本次strict/frozen+actual2/2+strict source/browser types；原Core85/85、build/check、public JS/strict TS与四suite13×3正常pack/Git/tgz/npm strict consumer保。Devkit verifyPack消费者引擎写strict=false的路径未执行；不把另行strict实际门当该标准consumer PASS。npm Git子包&path不支持仍明确N/A，合法Git路线为pnpm10.33。
4. **PASS**：普通私有Coremain/task push已回读，tag祖先保；当前main/tag不同commit而正常发布文件不变，合法不造新tag。原Core0.3.1/rc55/rc56与P04接受/rollback保。
5. **PASS**：本REPORT逐项actual/N/A/FAIL/NOT_RUN，CLEANUP实存覆盖，源工作树干净；本专用docs任务枝 `codex/merge-core-main-01-identity-rc3-report` 仅交本卡报告/CR/清理/证据，普通私有docs main发布、原生clean与对象回读后删除本docs工作树。最终发布回执留本run `_evidence/docs-publish-identity-rc3.json`。

未解决的产品门：本轮真实HTTP/账号/本人/OAuth/钱包/链/GUI/部署全部 **NOT_RUN**，不扩接受口径。已有可选 `authNonceSource:'server'` 发purpose=auth不在Identity published register|bind枚举，**docs/API.md已记该限制**；默认client profile保，本轮不启用该可选模式、不新增auth枚举或修邻层，也不报它PASS。活动BLOCKED不复原；rc.1源SQL失败、旧root browser/DTO负向失败原件保。

需要PM知道的：当前适用工程DELIVERED，源rc.3 actual可收；原CR据合法接收端named供给收紧，未来额外HTTP供给如需由PM/唯一planner定范围。REPORT先入正确私有docs main，最后fresh STATUS读取现任PM通知。不宣称全Identity/Web/钱包或owner ACCEPTED。
