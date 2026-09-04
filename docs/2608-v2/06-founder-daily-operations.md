# Founder 每日经营流程（Founder Daily Operating Process）

状态：初稿，待 Founder 确认。

## 0. 本文件的作用

这不是一份"用户故事"或功能清单，而是**未来所有页面、Agent、Workflow 的验收基准**。

> 任何新增的页面 / Agent / Workflow，都必须能在本文件的时间线中找到自己对应的真实时刻。
> 找不到对应时刻的功能，默认不予开发；如果确实需要，先回来修订本文件，再动工。

时间线中出现的品牌名、数字、场景均为**示意**，用于说明系统行为，不代表真实经营数据。

## 1. 一天的结构：四个身份如何分配在 24 小时里

Founder 同时是创始人/经营者/内容生产者/增长验证者，但不是四段互不相交的时间块——大多数时刻是"以一个身份为主，SinoFUT 在后台已经替其他三个身份把信息准备好"。下表是默认节奏，Founder 可按当天优先级调整，但六问驾驶舱（见 [03-information-architecture.md](03-information-architecture.md) 2.2 节）永远是每天第一站。

## 2. 完整时间线

| 时间 | 场景 | 主导身份 | Founder 的动作 | 系统侧动作 | 涉及一级导航 | 涉及领域对象 | 潜在 Agent/Workflow |
|---|---|---|---|---|---|---|---|
| 07:30（起床前，手机） | SinoFUT 晨报推送 | — | 躺床上扫一眼推送摘要 | SinoFUT 汇总过去 8 小时：Growth 夜间发现的新机会数、Studio 夜间产出的内容草稿数、Operator 夜间新订单/客诉数、待审批数 | SinoFUT | Opportunity、Content、Order、Task、Approval | 夜间巡检 Workflow（机会扫描、内容产线、订单监控三条并行流水线） |
| 08:30 | 打开系统，进入经营驾驶舱 | 创始人（总览视角） | 依次扫过六问卡片：今日机会/今日生产/今日经营/流量来源/今日利润/能力升级 | 驾驶舱按四身份重排数据，高亮"需要人工决策"的项 | 经营驾驶舱 | 全部经营对象汇总 | — |
| 08:45–09:30 | 能力复盘 | 创始人 | 查看昨天上线试跑的 2-3 个 Agent/Prompt/Workflow 的验证进度，判断是否满足 [05-business-ecosystem.md](05-business-ecosystem.md) 第4节的四项判定标准 | 能力中心展示：连续天数、内部结算净值、人工介入率、跨场景可复现性 | 能力中心 | Agent、Prompt、Workflow、Capability、Version | 能力验证追踪 Workflow |
| 09:30–10:30 | 机会雷达巡检 | 增长验证者 | 看 Growth 夜间发现的新机会（新热点/新品类信号/竞品动向），判断哪些值得转成 Strategy | 机会按信号强度排序，AI 给出初步评估理由 | 增长网络 | Opportunity、Strategy | 机会发现 Agent、机会评分 Workflow |
| 10:30–12:00 | 内容生产复核 | 内容生产者 | 打开 Studio 无限画布，复核 AI 生成的图文/短视频/短剧分镜草稿，做取舍与二次创作，确认发布 | 画布展示当天所有在制内容节点，AI 建议的发布渠道与排期 | 内容生产网络 | Content、Brand、Campaign | 图文生产 Workflow、视频生产 Workflow、短剧分镜 Agent |
| 12:00–12:30 | 午间审批队列 | 创始人（授权者） | 批量处理 SinoFUT 汇总的待审批项（如超预算广告、异常大额退款、新 Connector 授权） | Approval 面板按风险等级排序，附 AI 建议意见 | SinoFUT / 经营驾驶舱 | Approval、Task | 审批路由 Workflow |
| 13:30–15:00 | 经营执行 | 经营者 | 处理商品上下架决策、审核客服疑难工单、确认广告投放调整 | Operator 经营中心以队列形式呈现待办，而非表格墙 | 经营中心 | Product、Store、Order、Customer、Ad | 客服升级 Agent、库存预警 Workflow、广告调价 Agent |
| 15:00–16:00 | 流量与内容采购 | 经营者（跨平台协作） | 决定是否为某商品向 Growth 采购更多流量、向 Studio/Marketplace 采购新内容或能力 | 系统展示内部结算价与预期 ROI 供决策 | 经营中心 / Marketplace / Operator Cloud | Campaign、Ad、Content、Capability | 内部结算计价 Workflow |
| 16:00–17:00 | 增长资产建设 | 增长验证者 | 复盘私域/达人/渠道网络当天新增与流失，决定下一步渠道动作 | Growth 展示资产网络图的变化 diff | 增长网络 | Customer（私域标签）、Campaign | 私域运营 Agent |
| 17:00–17:45 | 利润与验证复盘 | 创始人 | 查看当天/当周利润归集，对照第 4 节判定标准决定哪些能力晋升、哪些淘汰 | Profit 数据自动关联到触发它的 Capability/Strategy | 数据中心 / 经营驾驶舱 | Profit、Capability | 利润归因 Workflow |
| 17:45–18:00 | 次日队列确认 | 创始人 | 确认/调整 SinoFUT 为明天排好的任务队列优先级 | SinoFUT 生成次日 Task 草案 | SinoFUT | Task | 每日任务排程 Workflow |
| 晚间（碎片时间，手机） | 追问与临时决策 | 按需切换 | 通过 SinoFUT 语音/文字追问某个数据、临时批准一个请求 | SinoFUT 保持上下文连续，不要求重新描述背景 | SinoFUT | 按需 | — |

## 3. 高于"天"的验证节奏

日流程之上叠加两层节奏，均在驾驶舱"能力升级"分区可见，不需要单独页面：

- **周节奏**：每周复盘一次 Growth/Studio/Operator 三个平台的独立核算利润（见 [05-business-ecosystem.md](05-business-ecosystem.md) 第2节），决定资源在三者间的倾斜方向。
- **月节奏**：每月评审一批达到"连续 ≥7 天验证通过"的 Capability，决定是否发布到 Marketplace/Operator Cloud，是否开放给未来的多店铺/多品牌复用。

## 4. 反向校验：从时间线推导页面/Agent/Workflow 优先级

| 时间线中的角色 | 对应能力层需求 | 说明 |
|---|---|---|
| SinoFUT 晨报 / 日终总结 | 夜间巡检 Workflow、每日任务排程 Workflow | 无这两个 Workflow，晨报/日终环节不成立，应作为 Phase 6 早期打通对象 |
| 能力复盘 | 能力验证追踪 Workflow + Capability 判定口径的数据管道 | 是"验证闸门"从文档变成可用工具的第一批开发对象 |
| 机会雷达 / 内容画布 / 经营队列 | 对应 Growth/Studio/Operator 三个平台各自的最小可用 Agent 集合 | 只有这三处打通，Phase 6 的闭环演示才成立 |
| 午间审批 | 审批路由 Workflow | 是人工授权原则（宪章"Human-in-the-loop"）在系统里的唯一落地入口，优先级高 |
| 流量/内容采购 | 内部结算计价 Workflow | 依赖 05 号文档第2节的内部结算价机制先被定义为可计算的规则，而非只是文档描述 |

## 5. 设计校验规则（供后续所有开发使用）

在提出任何新页面、新 Agent、新 Workflow 之前，先回答：

1. 它出现在本文件时间线的哪一行？如果答不出来，先补充时间线，不要先写代码。
2. 它服务于四个身份中的哪一个？是否已经有更合适的一级导航入口承载它（见 [03-information-architecture.md](03-information-architecture.md)）？
3. 它是否会被 Founder 本人连续使用满足 [05-business-ecosystem.md](05-business-ecosystem.md) 第4节的验证标准？如果设计上就无法被"真实使用"（例如只有 mock 数据、无法关联真实 Profit），说明它还不该进入开发排期。

## 6. 与 V1 的关系

V1 没有以"Founder 一天的真实经营流程"作为设计输入，而是按软件模块（Agent 中心/Prompt 中心/…）独立设计页面，这正是宪章要纠正的"先把所有页面做出来"的问题。本文件不参考 V1 任何页面清单或交互细节。
