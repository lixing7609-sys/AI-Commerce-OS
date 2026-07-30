# AI Commerce OS Founder Master Edition V1.0 — 中文框架审查版

本文档是 Founder 全部 51 个可见页面的产品审查清单，供产品负责人逐页核对：名称是否正确、功能是否正确、功能归属是否正确、页面结构是否正确、操作入口是否齐全、页面之间的关系是否合理。

**本轮性质**：全量中文产品框架搭建，不是后端功能开发。除个别标注"部分接入真实后端"的位置外，全部数据均为演示数据，页面内均有"演示框架｜尚未接入真实业务数据"标识。

**数据来源**：本文档与 `frontend/src/console/modules/productReview/reviewManifest.js` 保持一致——Founder 内置的"产品审查"模式（顶部工具栏"产品审查"按钮，`?module=productReview`）读取的是同一份清单，并额外提供逐页"已确认 / 待修改"的人工审查记录（保存在浏览器本地）。两边任何一边有结构性改动都需要同步更新另一边。

**导航架构**：本轮不改动已冻结的 5 大顶层导航分组（Founder Master Edition Charter / ADR-0007），只在分组内做中文命名与页面框架完善。

---

## 一、总览

| 顶层分组 | 中文组名 | 页面数 |
|---|---|---|
| A | Founder 工作台 | 8 |
| B | AI 能力中心 | 7 |
| C | Operator 实验室 | 13 |
| D | Studio 实验室 | 13 |
| E | Cloud Center | 10 |
| **合计** | | **51** |

---

## 二、A. Founder 工作台（8）

| 序号 | 顶层分组 | 中文页面名称 | 内部页面 key | 页面职责 | 核心功能区域 | 当前实现文件 | 当前状态 | 是否接入后端 | 待产品负责人确认事项 |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Founder 工作台 | 今日总览 | `founderWorkbench` | Founder 每日入口，汇总待办/审批/经营/内容/设备/风险/AI建议 | 今日待办、待审批事项、关键经营指标、内容生产状态、设备与云端状态、风险提醒、AI 建议、快捷入口 | `src/console/modules/founderWorkbench/FounderWorkbenchModule.jsx`（Tabs：秘书 / 今日经营） | 框架就绪 | 部分（系统运行状态尝试读真实后端，失败回退演示数据） | 秘书对话与"今日经营"两个 Tab 的分工是否清晰，是否需要合并展示 |
| 2 | Founder 工作台 | 决策中心 | `decisions` | 汇总需要 Founder 批准/驳回的经营决策 | 待决策、审议中、已批准、已驳回、已执行、决策详情、影响范围、发起来源、负责人、截止时间、批准/驳回演示 | `src/console/modules/decisions/DecisionsModule.jsx` | 框架就绪 | 否 | 决策来源是否需要接入真实审批流引擎 |
| 3 | Founder 工作台 | 开发进度 | `development` | AI Commerce OS 自身版本路线图与迭代看板 | 版本路线图、当前迭代、模块进度、开发任务、测试状态、发布准备、阻塞事项、变更记录 | `src/console/modules/development/DevelopmentModule.jsx` | 框架就绪 | 否 | 是否应该接入真实 CI/CD 数据 |
| 4 | Founder 工作台 | 经营验证 | `businessValidation` | 验证 Operator 实验室经营数据健康度的摘要视图 | 店铺经营概览、商品验证、订单验证、客户验证、广告验证、利润验证、真实/演示数据标识、进入 Operator 实验室 | `src/console/modules/businessValidation/BusinessValidationModule.jsx` | 框架就绪 | 否 | 摘要数字与 Operator 实验室详情页是否需要强一致（本轮为同源锚点，非强一致） |
| 5 | Founder 工作台 | 内容验证 | `contentValidation` | 验证 Studio 实验室内容生产健康度的摘要视图 | 内容项目、生产数量、审核通过率、发布数量、互动表现、内容成本、真实/演示数据标识、进入 Studio 实验室 | `src/console/modules/contentValidation/ContentValidationModule.jsx` | 框架就绪 | 否 | 同上 |
| 6 | Founder 工作台 | 云端状态 | `cloudStatus` | 验证 Cloud Center 设备群健康度的摘要视图 | 设备在线率、Operator 数量、版本分布、许可证状态、Token 使用、节点状态、告警摘要、进入 Cloud Center | `src/console/modules/cloudStatus/CloudStatusModule.jsx` | 框架就绪 | 否 | 同上 |
| 7 | Founder 工作台 | 风险中心 | `risks` | 汇总六类风险并跟踪处理进度 | 经营风险、内容风险、系统风险、设备风险、成本风险、合规风险、风险等级、责任人、处理进度 | `src/console/modules/risks/RisksModule.jsx` | 框架就绪 | 否 | 风险升级/告警联动规则是否需要真实定义 |
| 8 | Founder 工作台 | 通知中心 | `notifications` | 全部通知的统一收件箱 | 系统通知、审批通知、经营通知、内容通知、设备通知、安全通知、已读/未读、通知设置 | `src/console/modules/notifications/NotificationsModule.jsx` | 框架就绪 | 否 | 通知设置（免打扰/渠道偏好）是否需要真实持久化 |

---

## 三、B. AI 能力中心（7）

顶部统一提供版本范围选择器（全部 / Founder / Operator / Studio / Cloud）与统一生命周期指示（设计→配置→测试→评测→审批→发布→观察→优化）。

| 序号 | 顶层分组 | 中文页面名称 | 内部页面 key | 页面职责 | 核心功能区域 | 当前实现文件 | 当前状态 | 是否接入后端 | 待产品负责人确认事项 |
|---|---|---|---|---|---|---|---|---|---|
| 9 | AI 能力中心 | Agent 中心 | `agentCenter` | Founder 自建/管理 AI Agent 的生产中心 | Agent 列表、分类、适用版本、状态、当前版本、使用次数、成功率、成本、新建 Agent、Agent 详情、模型路由、测试记录、发布记录 | `src/console/modules/agentCenter/AgentCenterModule.jsx` | 框架就绪 | 否 | Founder-scope 与 Studio-scope Agent 的边界是否需要更明确的视觉区分 |
| 10 | AI 能力中心 | Prompt 中心 | `promptCenter` | Prompt 资产设计/测试/审批/发布中心 | Prompt 列表、适用 Agent、适用版本、Prompt 版本、变量、测试台、对比结果、审批状态、发布状态、使用记录 | `src/console/modules/promptCenter/PromptCenterWorkbench.jsx` | 框架就绪 | 否 | 否 |
| 11 | AI 能力中心 | Skill 中心 | `skillCenter` | Skill 目录与生命周期管理 | Skill 列表、能力说明、输入输出、依赖、适用 Agent、测试状态、权限范围、当前版本、发布状态 | `src/console/modules/skillCenter/SkillCenterWorkbench.jsx` | 框架就绪 | 否 | 否 |
| 12 | AI 能力中心 | Workflow 中心 | `workflowCenter` | 自动化流程编排、执行与回放 | Workflow 列表、流程画布框架、节点列表、触发条件、执行记录、任务回放、失败节点、重试、版本、发布 | `src/console/modules/workflowCenter/WorkflowCenterModule.jsx` | 框架就绪 | 否 | 流程画布是否需要真实可视化编排引擎（本轮为简化节点顺序展示） |
| 13 | AI 能力中心 | 知识中心 | `knowledgeCenter` | 供 Agent 检索的知识库管理 | 知识库列表、文档数量、数据来源、更新时间、适用范围、索引状态、检索测试、权限、版本、同步状态 | `src/console/modules/knowledgeCenter/KnowledgeCenterModule.jsx` | 框架就绪 | 否 | 否 |
| 14 | AI 能力中心 | Connector 中心 | `connectorCenter` | Founder 技术配置中心，可见 API/Webhook 级技术信息 | 连接器目录、平台分类、连接状态、授权状态、数据同步、健康检查、权限范围、错误记录、配置入口、测试连接 | `src/console/modules/connectorCenter/ConnectorCenterModule.jsx` | 框架就绪 | 否 | 需确认此处技术信息未泄露到 Operator 经营设置页 |
| 15 | AI 能力中心 | 能力中心 | `capabilityCenter` | AI 能力生命周期治理入口 | 能力目录、评测中心、基准测试、审批中心、发布中心、成本分析、使用观察、版本记录、Studio/Operator/Cloud 范围能力 | `src/console/modules/capabilityCenter/CapabilityCenterModule.jsx` | 框架就绪 | 否 | 否 |

---

## 四、C. Operator 实验室（13）

| 序号 | 顶层分组 | 中文页面名称 | 内部页面 key | 页面职责 | 核心功能区域 | 当前实现文件 | 当前状态 | 是否接入后端 | 待产品负责人确认事项 |
|---|---|---|---|---|---|---|---|---|---|
| 16 | Operator 实验室 | 经营工作台 | `workbench` | 默认落地页，今日经营状态一屏汇总 | 今日经营概览、店铺状态、待处理订单、客服消息、营销任务、广告建议、利润提醒、Operator 秘书建议、待审批事项 | `src/console/labs/operatorLabV2/pages/WorkbenchPage.jsx` | 框架就绪 | 否 | 否 |
| 17 | Operator 实验室 | 商品中心 | `products` | 商品全生命周期管理 | 商品列表、状态、SKU、库存、售价、成本、毛利、渠道、内容完成度、上架状态、新增/编辑商品 | `src/console/modules/productCenter/ProductCenterModule.jsx` | 框架就绪 | 否 | 否 |
| 18 | Operator 实验室 | 订单中心 | `orders` | 订单筛选、发货、售后与利润追踪 | 订单列表、状态、渠道、客户、商品、金额、支付、发货、售后、退款、利润影响、订单详情 | `src/console/modules/orderCenter/OrderCenterModule.jsx` | 框架就绪 | 否 | 否 |
| 19 | Operator 实验室 | 客户中心 | `customers` | 客户分层、来源、消费与跟进 | 客户列表、分层、来源渠道、最近购买、累计消费、意向、标签、跟进状态、客户详情 | `src/console/labs/operatorLabV2/pages/CustomersPage.jsx` | 框架就绪 | 否 | 否 |
| 20 | Operator 实验室 | 客服中心 | `customerService` | AI 接待 + 人工接管客服会话 | 会话列表、AI 接待、人工接管、待回复、售前、售后、投诉、风险消息、推荐回复、会话详情 | `src/console/modules/customerServiceCenter/CustomerServiceCenterModule.jsx` | 框架就绪 | 否 | 否 |
| 21 | Operator 实验室 | 营销中心 | `marketing` | 营销活动策划与内容需求提报 | 营销活动、优惠方案、内容需求、活动日历、人群、渠道、预算、效果、创建活动、提交内容需求到 Studio | `src/console/labs/operatorLabV2/pages/MarketingPage.jsx` | 框架就绪 | 否 | 否 |
| 22 | Operator 实验室 | 广告投放 | `adOps` | AI 投放建议审批与执行跟踪 | AI 投放建议、广告计划、投放平台、目标人群、预算、素材、预计效果、待批准、批准/驳回/暂停、投放结果、复盘 | `src/console/labs/operatorLabV2/pages/AdOpsPage.jsx` | 框架就绪 | 否 | 否 |
| 23 | Operator 实验室 | 品牌中心 | `brand` | 品牌定位与一致性检查 | 品牌概览、定位、商品线、品牌资产、一致性、内容使用情况、品牌授权、品牌问题、进入 Studio 品牌资产 | `src/console/labs/operatorLabV2/pages/BrandPage.jsx` | 框架就绪 | 否 | 否 |
| 24 | Operator 实验室 | Operator 秘书 | `aiSecretary` | 只负责经营 Runtime 的 AI 秘书 | 今日建议、经营异常、利润建议、广告建议、商品建议、客服建议、待审批事项、执行记录、接受/驳回建议 | `src/console/labs/operatorLabV2/pages/AiSecretaryWorkbenchPage.jsx` | 框架就绪 | 否 | 需确认与 Founder 今日总览秘书、Studio 秘书的边界持续清晰 |
| 25 | Operator 实验室 | 数据中心 | `analytics` | 多维经营数据分析 | 销售、商品、客户、订单、广告、内容、渠道数据、趋势、对比、数据导出 | `src/console/labs/operatorLabV2/pages/AnalyticsPage.jsx` | 框架就绪 | 否 | 否 |
| 26 | Operator 实验室 | 财务与利润 | `financeProfit` | 从收入到净经营利润的完整财务视图 | 销售收入、商品成本、平台费用、广告费用、Token 成本、退款、毛利润、净经营利润、利润趋势、商品/店铺/订单利润 | `src/console/labs/operatorLabV2/pages/FinanceProfitPage.jsx` | 框架就绪 | 否 | 否 |
| 27 | Operator 实验室 | 组织与审批 | `organization` | 团队、权限与审批流程管理 | 成员、AI 角色、职责、权限、审批流程、待审批、已审批、异常事项、自动经营规则、人工接管 | `src/console/labs/operatorLabV2/pages/OrganizationPage.jsx` | 框架就绪 | 否 | 否 |
| 28 | Operator 实验室 | 经营设置 | `settings` | 店铺管理、平台连接与经营配置 | 店铺管理、平台连接、店铺授权、同步状态、经营规则、通知设置、时区与语言、数据权限、安全设置 | `src/console/labs/operatorLabV2/pages/SettingsWorkbenchPage.jsx` | 框架就绪 | 部分（店铺管理 Tab 读真实后端 `/api/v1/shops`） | 需确认平台连接 Tab 未泄露 API 密钥/Webhook/NAS 等技术信息 |

---

## 五、D. Studio 实验室（13）

| 序号 | 顶层分组 | 中文页面名称 | 内部页面 key | 页面职责 | 核心功能区域 | 当前实现文件 | 当前状态 | 是否接入后端 | 待产品负责人确认事项 |
|---|---|---|---|---|---|---|---|---|---|
| 29 | Studio 实验室 | Studio 工作台 | `workspace` | 项目总览与生产队列，不拥有生产流水线 | 项目概览、生产队列、内容日历、任务分配、审核队列、截止时间、跨项目状态、Studio 秘书建议 | `src/studio/pages/WorkspacePage.jsx` | 框架就绪 | 否 | 需确认未夹带任何内容类型的生产流水线 |
| 30 | Studio 实验室 | AI 短剧 | `shortDrama` | 短剧十阶段端到端生产流水线 | 项目列表、创意、剧本、分镜、角色、场景、配音、视频生成、字幕、审核、发布交接、版本、预览 | `src/studio/pages/ShortDramaWorkbench.jsx`（含 `DirectorWorkspace.jsx`） | 框架就绪 | 否 | 否 |
| 31 | Studio 实验室 | AI 视频 | `aiVideo` | 通用视频内容生产流水线 | 视频项目、创意简报、脚本、镜头清单、素材、视频生成、剪辑、配音与字幕、审核、发布交接、版本、预览 | `src/studio/pages/AiVideoWorkbench.jsx` | 框架就绪 | 否 | 否 |
| 32 | Studio 实验室 | AI 图片 | `graphicContent` | 图文内容生产流水线 | 图片项目、需求简报、参考素材、Prompt、生成设置、候选图片、编辑、对比、审核、保存素材库、版本、成本 | `src/studio/pages/AiImageWorkbench.jsx` | 框架就绪 | 否 | 否 |
| 33 | Studio 实验室 | AI 文章 | `aiArticle` | 图文/长文研究到发布流水线 | 文章项目、研究资料、大纲、初稿、改写、SEO 与平台适配、审核、发布交接、版本、引用来源、成本 | `src/studio/pages/AiArticleWorkbench.jsx` | 框架就绪 | 否 | 否 |
| 34 | Studio 实验室 | AI 直播 | `aiLive` | 直播选题到带货复盘流水线 | 直播项目、主题、商品清单、脚本、排练、直播控制台框架、AI 主播、实时提示、带货数据、复盘、发布切片 | `src/studio/pages/AiLiveWorkbench.jsx` | 框架就绪 | 否 | 否 |
| 35 | Studio 实验室 | AI 音频 | `aiAudio` | 音频内容生产流水线 | 音频项目、文稿、音色、配音、背景音乐、音效、时间轴、试听、审核、导出、版本、成本 | `src/studio/pages/AiAudioWorkbench.jsx` | 框架就绪 | 否 | 否 |
| 36 | Studio 实验室 | 矩阵账号 | `matrixAccounts` | 多平台矩阵账号管理 | 账号列表、平台、状态、粉丝、内容数量、授权状态、账号定位、发布频率、风险状态、账号详情 | `src/studio/pages/MatrixAssetPages.jsx` | 框架就绪 | 否 | 否 |
| 37 | Studio 实验室 | 发布中心 | `publishingCenter` | 跨平台发布状态统一调度 | 待发布、发布中、已发布、发布失败、平台、账号、发布时间、内容版本、审核状态、流量/广告资源、发布记录 | `src/studio/pages/PublishingCenterPage.jsx` | 框架就绪 | 否 | 否 |
| 38 | Studio 实验室 | 素材库 | `assetLibrary` | 全部素材资产统一库 | 图片、视频、音频、文档、模板、商品/项目素材、标签、来源、授权、使用记录、搜索筛选 | `src/studio/pages/AssetLibraryPage.jsx` | 框架就绪 | 否 | 否 |
| 39 | Studio 实验室 | 品牌资产 | `brandAssets` | 品牌规范与视觉资产管理 | 品牌规范、Logo、字体、色彩、商品视觉、模板、品牌故事、IP 角色、授权合作、使用规则、一致性检查 | `src/studio/pages/BrandAssetsPage.jsx` | 框架就绪 | 否 | 否 |
| 40 | Studio 实验室 | 内容数据 | `analytics` | 内容生产/发布/变现效果分析 | 内容产量、发布数量、播放、阅读、互动、转化、收益、成本、Token 使用、平台对比、类型对比、项目复盘 | `src/studio/pages/AnalyticsWorkbench.jsx` | 框架就绪 | 否 | 否 |
| 41 | Studio 实验室 | Studio 设置 | `settings` | 平台连接与审核/发布/品牌规则配置 | 平台连接、矩阵账号权限、内容审核规则、发布规则、品牌规则、素材权限、通知设置、成本限制、生成偏好 | `src/studio/pages/SettingsWorkbench.jsx` | 框架就绪 | 否 | 否 |

---

## 六、E. Cloud Center（10）

组名保留英文品牌名 "Cloud Center"，组内子项使用中文命名。

| 序号 | 顶层分组 | 中文页面名称 | 内部页面 key | 页面职责 | 核心功能区域 | 当前实现文件 | 当前状态 | 是否接入后端 | 待产品负责人确认事项 |
|---|---|---|---|---|---|---|---|---|---|
| 42 | Cloud Center | 设备管理 | `devices` | 设备群健康度/版本/许可证/Token 总览 | 设备列表、Operator、设备编号、型号、在线状态、当前版本、许可证、Token 状态、最近心跳、告警、远程操作入口 | `src/cloud/cloudPages.jsx`（DevicesWorkbenchPage） | 框架就绪 | 否 | 否 |
| 43 | Cloud Center | OTA 更新 | `otaSupport` | 版本更新包灰度发布与回滚 | 更新包、目标版本、发布通道、目标设备、灰度比例、更新时间/进度、失败设备、暂停/继续/回滚 | `src/cloud/cloudPages.jsx`（OtaSupportPage） | 框架就绪 | 否 | 否 |
| 44 | Cloud Center | 许可证 | `licenses` | Operator 许可证套餐与到期管理 | 许可证列表、Operator、设备、版本、授权能力、生效/到期时间、状态、暂停/续期/转移 | `src/cloud/cloudPages.jsx`（LicensesPage） | 框架就绪 | 否 | 否 |
| 45 | Cloud Center | Token 中心 | `cloudToken` | 全平台 Token 计量与授予/充值 | Token 套餐、购买记录、分配、Operator、设备、使用量、余额、成本、预警、充值/调整额度 | `src/console/modules/cloudToken/CloudTokenModule.jsx` | 框架就绪 | 否 | 需确认与设备管理引用同一锚点设备/Operator |
| 46 | Cloud Center | Marketplace | `marketplaceCenter` | Founder 视角能力市场管理，不过滤任何提交状态 | 应用、Agent、Prompt、Skill、Workflow、Connector、模板、行业方案、发布、审核、安装、升级、评分、收益 | `src/console/labs/MarketplaceCenter.jsx` | 框架就绪 | 否 | 否 |
| 47 | Cloud Center | 版本管理 | `cloudVersion` | 四个产品各自版本发布通道管理 | Founder/Operator/Studio/Cloud 版本、发布通道、测试/灰度/正式版本、版本说明、依赖、发布/回滚 | `src/console/modules/cloudVersion/CloudVersionModule.jsx` | 框架就绪 | 否 | 需确认与设备管理引用同一锚点设备/Operator |
| 48 | Cloud Center | 资产管理 | `cloudAssets` | 分发资产版本与校验状态管理 | 安装包、配置包、模型资源、模板资源、内容资源、依赖关系、版本、大小、校验状态、发布状态 | `src/console/modules/cloudAssets/CloudAssetsModule.jsx` | 框架就绪 | 否 | 否 |
| 49 | Cloud Center | 节点调度 | `distributedScheduling` | 分布式调度架构预留能力展示 | 节点列表、位置、设备、算力、当前任务、队列、负载、状态、调度策略、分配任务/暂停节点 | `src/cloud/cloudPages.jsx`（DistributedSchedulingPage） | 框架就绪 | 否（`distributedCompute.enabled` 恒为 false，明确标注未来能力） | 否 |
| 50 | Cloud Center | 系统监控 | `monitoring` | 设备群总览 + 本机硬件/容器状态 | 服务状态、设备在线率、请求量、错误率、Token 使用、任务队列、节点负载、告警、事件、处理状态 | `src/console/modules/monitoring/MonitoringModule.jsx` | 框架就绪 | 部分（服务状态 Tab 的 AI 运营系统状态读真实后端） | 否 |
| 51 | Cloud Center | 日志中心 | `logs` | 设备/OTA/Token/许可证/安全/操作全量日志检索 | 系统日志、设备日志、OTA 日志、Token 日志、许可证日志、安全日志、操作日志、错误日志、搜索、筛选、详情、关联事件 | `src/console/modules/logs/LogsModule.jsx` | 本轮重建（原仅有级别筛选+单表，PageHeader 标题原为英文 "Logs"） | 否 | 需确认关联事件跳转到设备管理对应设备详情的交互是否符合预期 |

---

## 七、共享演示数据锚点

跨页面保持一致的关键实体（见 `frontend/src/demoData/sharedDemoEntities.js`）：

- **锚点订单**：来自订单仓库（`console/mock/orderMock.js`），在订单中心 / 财务与利润 / 数据中心 / Operator 秘书 / 风险中心复用同一条记录。
- **锚点商品**：SKU-HUM-002「便携折叠加湿器」，抖音店A，库存 0——已在今日总览的补货建议与商品中心中交叉出现。
- **锚点内容项目**：红果短剧《重生后我接管了老板的公司》EP13-16（`proj-7`），在 Studio 工作台项目队列 / AI 短剧 / 内容验证中交叉出现。
- **锚点设备/Operator**：`mac-mini-op-0001` / 星辰家居贸易（`cloud/mock/cloudMock.js`），在设备管理 / OTA 更新 / 许可证 / Token 中心 / 系统监控 / 日志中心中交叉出现。

---

## 八、如何使用本文档

1. 产品负责人可以直接在本文档里逐行核对，也可以在 Founder 里点击顶部工具栏"产品审查"按钮进入交互式版本（同一份清单，支持逐页标记"已确认 / 待修改"并写备注，保存在浏览器本地）。
2. "当前状态"列标注"本轮重建"的页面是本轮改动最大的页面，建议优先审查。
3. "待产品负责人确认事项"列出的是本轮实施过程中主动识别、需要人工判断的问题，不代表已经是缺陷。
4. 本文档不因页面内容细节调整而频繁改版——只有顶层分组、页面清单本身、页面职责发生结构性变化时才需要更新（并同步更新 `reviewManifest.js`）。
