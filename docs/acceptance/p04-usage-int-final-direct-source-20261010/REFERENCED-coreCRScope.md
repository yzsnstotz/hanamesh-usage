# CR-CORE-HTTP-URL-SUPPLY-01 · rc.3供给后的精确适用复核

2026-10-09 JST。原宽请求原文已保 `CR-CORE-HTTP-URL-SUPPLY-01-HISTORY.md`；以下是新的source证据，不抹原缺口/FAIL或代PM改CARD。

**当前Core/Web绑定URL的实际输入已有合法named来源，不再需要为了这个输入新增Core协议副本或CoreBindLinkQuery。** Identity rc.3的 `@hanamesh/server-identity/contracts` 和 `/contract` 公开 `DeviceBindInput`，字段deviceId/nonce/signature与Core真正bindLink生成的query一致。当前Core实际生成URL，经正常installed source DeviceChallengeInput/DeviceChallengeDTO/DeviceBindInput schema通过；四个适用named类型的DOM strict和Core实际注册返回互赋值通过，未复制DTO。

Web可正常消费该接收端的DeviceBindInput作为提交体/解码query的类型，以及已有 `hanamesh-core/contract` 的SessionSnapshot['deviceId']；其实际解析/网络/本人/UI仍归Web，Core本次没有冒Web consumer PASS。

原建议CoreBindLinkResponse是Core POST响应而非Web直接消费项；完整CoreHTTP/state wrapper也不是当前P04已交调用矩阵的一部分。额外source HTTP-only suite本轮未授权扩大，Services ABI suite对纯HTTP网页仍N/A；已有Core actual URL输出/source schema门不能冒成已发布全HTTP suite。以上扩展若未来确需，仍由PM/唯一planner明确当前卡范围，不默认成为本轮Identity候选actual或Core私有main收口的新增硬前件。

**本轮精确结果：4适用named type/source query实际通过，13项无Core调用N/A；原宽CR交PM按此证据收紧，不在Core新增依赖/接口/类型拷贝来关门。** 原Core0.3.2公开types/业务/schema与接受不变；Identityrc.2运行门按82/88同byte保，rc.3只正常更新验证包/锁/探针。真实HTTP/bind本人与平台停点均不重试。
