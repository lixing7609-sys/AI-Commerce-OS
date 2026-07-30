/**
 * Founder Master Edition V1.0 中文框架审查版 —— 51 个可见页面的权威清单。
 *
 * 这是"产品审查"模式（ProductReviewModule.jsx）和
 * docs/product-review/Founder_Master_Edition_Chinese_Framework_Review.md
 * 共用的唯一数据源——文档由这份清单人工同步维护，不是自动生成，改动
 * 页面结构时两边都要更新，避免自己批自己的清单和文档背离。
 *
 * status 字段是本轮（中文框架审查版）的框架完成度自评，不代表功能
 * 完整度："framework_ready" = 15 项框架标准已具备，可供人工审查；
 * "needs_followup" = 框架已具备但存在已知待跟进项（在 followUp 里
 * 说明）。没有 "not_started"——51 个页面在本轮结束前都必须至少达到
 * framework_ready。
 *
 * backend 字段：'demo' = 纯演示数据；'partial' = 一部分读真实后端
 * （失败自动回退演示数据，不是伪装成功）；没有 'live' —— 本轮明确
 * 不接真实后端全链路。
 */

export const REVIEW_GROUPS = [
  { key: "founderWorkspaceGroup", label: "Founder 工作台", count: 8 },
  { key: "aiCapabilityCenterGroup", label: "AI 能力中心", count: 7 },
  { key: "operatorLabGroup", label: "Operator 实验室", count: 13 },
  { key: "studioLabGroup", label: "Studio 实验室", count: 13 },
  { key: "cloudCenterGroup", label: "Cloud Center", count: 10 },
];

export const REVIEW_PAGES = [
  // ---- A. Founder 工作台（8） ----
  {
    group: "founderWorkspaceGroup", label: "今日总览", key: "founderWorkbench",
    responsibility: "Founder 每日进入 Founder 工作台后的第一屏，汇总待办/审批/经营/内容/设备/风险/AI建议，是全部经营信息的入口。",
    sections: ["今日待办", "待审批事项", "关键经营指标", "内容生产状态", "设备与云端状态", "风险提醒", "AI 建议", "快捷入口"],
    file: "src/console/modules/founderWorkbench/FounderWorkbenchModule.jsx（Tabs：秘书→secretary/SecretaryModule.jsx，今日经营→dashboard/DashboardModule.jsx）",
    backend: "partial", backendNote: "系统运行状态/任务统计尝试读真实后端 API，失败自动回退演示数据（safeCall 包裹）。",
    followUp: [],
  },
  {
    group: "founderWorkspaceGroup", label: "决策中心", key: "decisions",
    responsibility: "汇总需要 Founder 批准/驳回的经营决策，按状态分组，可下钻到发起来源。",
    sections: ["待决策", "审议中", "已批准", "已驳回", "已执行", "决策详情", "影响范围", "发起来源", "负责人", "截止时间", "批准/驳回演示交互"],
    file: "src/console/modules/decisions/DecisionsModule.jsx",
    backend: "demo", backendNote: "",
    followUp: [],
  },
  {
    group: "founderWorkspaceGroup", label: "开发进度", key: "development",
    responsibility: "展示 AI Commerce OS 自身的版本路线图和当前迭代开发状态，是面向 Founder 的产品自身进度看板。",
    sections: ["版本路线图", "当前迭代", "模块进度", "开发任务", "测试状态", "发布准备", "阻塞事项", "变更记录"],
    file: "src/console/modules/development/DevelopmentModule.jsx",
    backend: "demo", backendNote: "",
    followUp: [],
  },
  {
    group: "founderWorkspaceGroup", label: "经营验证", key: "businessValidation",
    responsibility: "从 Founder 视角验证 Operator 实验室里的真实经营数据是否健康，是 Founder 工作台通往 Operator 实验室的摘要视图。",
    sections: ["店铺经营概览", "商品验证", "订单验证", "客户验证", "广告验证", "利润验证", "真实/演示数据标识", "进入 Operator 实验室"],
    file: "src/console/modules/businessValidation/BusinessValidationModule.jsx",
    backend: "demo", backendNote: "",
    followUp: [],
  },
  {
    group: "founderWorkspaceGroup", label: "内容验证", key: "contentValidation",
    responsibility: "从 Founder 视角验证 Studio 实验室里的内容生产是否健康，是通往 Studio 实验室的摘要视图。",
    sections: ["内容项目", "生产数量", "审核通过率", "发布数量", "互动表现", "内容成本", "真实/演示数据标识", "进入 Studio 实验室"],
    file: "src/console/modules/contentValidation/ContentValidationModule.jsx",
    backend: "demo", backendNote: "",
    followUp: [],
  },
  {
    group: "founderWorkspaceGroup", label: "云端状态", key: "cloudStatus",
    responsibility: "从 Founder 视角验证 Cloud Center 管理的设备群是否健康，是通往 Cloud Center 的摘要视图。",
    sections: ["设备在线率", "Operator 数量", "版本分布", "许可证状态", "Token 使用", "节点状态", "告警摘要", "进入 Cloud Center"],
    file: "src/console/modules/cloudStatus/CloudStatusModule.jsx",
    backend: "demo", backendNote: "",
    followUp: [],
  },
  {
    group: "founderWorkspaceGroup", label: "风险中心", key: "risks",
    responsibility: "汇总经营/内容/系统/设备/成本/合规六类风险，按等级和责任人跟踪处理进度。",
    sections: ["经营风险", "内容风险", "系统风险", "设备风险", "成本风险", "合规风险", "风险等级", "责任人", "处理进度"],
    file: "src/console/modules/risks/RisksModule.jsx",
    backend: "demo", backendNote: "",
    followUp: [],
  },
  {
    group: "founderWorkspaceGroup", label: "通知中心", key: "notifications",
    responsibility: "全部系统/审批/经营/内容/设备/安全通知的统一收件箱。",
    sections: ["系统通知", "审批通知", "经营通知", "内容通知", "设备通知", "安全通知", "已读/未读", "通知设置"],
    file: "src/console/modules/notifications/NotificationsModule.jsx",
    backend: "demo", backendNote: "",
    followUp: [],
  },

  // ---- B. AI 能力中心（7） ----
  {
    group: "aiCapabilityCenterGroup", label: "Agent 中心", key: "agentCenter",
    responsibility: "Founder 自建/管理 AI Agent 的生产中心，Founder 侧和 Studio 侧的 Agent 在这里以作用域 Tab 区分。",
    sections: ["Agent 列表", "Agent 分类", "适用版本", "状态", "当前版本", "使用次数", "成功率", "成本", "新建 Agent", "Agent 详情", "模型路由", "测试记录", "发布记录"],
    file: "src/console/modules/agentCenter/AgentCenterModule.jsx（组合 agentStudio/AgentStudioModule.jsx、modelRouter/ModelRouterModule.jsx、studioLab/StudioAgentModules.jsx）",
    backend: "demo", backendNote: "",
    followUp: [],
  },
  {
    group: "aiCapabilityCenterGroup", label: "Prompt 中心", key: "promptCenter",
    responsibility: "Prompt 资产的设计/测试/审批/发布中心。",
    sections: ["Prompt 列表", "适用 Agent", "适用版本", "Prompt 版本", "变量", "测试台", "对比结果", "审批状态", "发布状态", "使用记录"],
    file: "src/console/modules/promptCenter/PromptCenterWorkbench.jsx（壳）+ PromptCenterModule.jsx",
    backend: "demo", backendNote: "",
    followUp: [],
  },
  {
    group: "aiCapabilityCenterGroup", label: "Skill 中心", key: "skillCenter",
    responsibility: "Skill（Agent 可调用的原子能力）的目录与生命周期管理。",
    sections: ["Skill 列表", "能力说明", "输入/输出", "依赖", "适用 Agent", "测试状态", "权限范围", "当前版本", "发布状态"],
    file: "src/console/modules/skillCenter/SkillCenterWorkbench.jsx（壳）+ SkillCenterModule.jsx",
    backend: "demo", backendNote: "",
    followUp: [],
  },
  {
    group: "aiCapabilityCenterGroup", label: "Workflow 中心", key: "workflowCenter",
    responsibility: "多步骤自动化流程（Workflow）的编排、执行与回放中心。",
    sections: ["Workflow 列表", "流程画布框架", "节点列表", "触发条件", "执行记录", "任务回放", "失败节点", "重试", "版本", "发布"],
    file: "src/console/modules/workflowCenter/WorkflowCenterModule.jsx",
    backend: "demo", backendNote: "",
    followUp: [],
  },
  {
    group: "aiCapabilityCenterGroup", label: "知识中心", key: "knowledgeCenter",
    responsibility: "供 Agent 检索的知识库管理中心。",
    sections: ["知识库列表", "文档数量", "数据来源", "更新时间", "适用范围", "索引状态", "检索测试", "权限", "版本", "同步状态"],
    file: "src/console/modules/knowledgeCenter/KnowledgeCenterModule.jsx",
    backend: "demo", backendNote: "",
    followUp: [],
  },
  {
    group: "aiCapabilityCenterGroup", label: "Connector 中心", key: "connectorCenter",
    responsibility: "Founder 技术配置中心——平台/AI/基础设施/企业四类连接器的目录、授权与健康检查，可见 API/Webhook 级别的技术信息（与 Operator 经营设置的业务化视角不同）。",
    sections: ["连接器目录", "平台分类", "连接状态", "授权状态", "数据同步", "健康检查", "权限范围", "错误记录", "配置入口", "测试连接"],
    file: "src/console/modules/connectorCenter/ConnectorCenterModule.jsx",
    backend: "demo", backendNote: "",
    followUp: [],
  },
  {
    group: "aiCapabilityCenterGroup", label: "能力中心", key: "capabilityCenter",
    responsibility: "AI 能力生命周期（设计→配置→测试→评测→审批→发布→观察→优化）的汇总与治理入口。",
    sections: ["能力目录", "评测中心", "基准测试", "审批中心", "发布中心", "成本分析", "使用观察", "版本记录", "Studio/Operator/Cloud 范围能力"],
    file: "src/console/modules/capabilityCenter/CapabilityCenterModule.jsx（组合 benchmarkCenter/、evaluationCenter/ 等）",
    backend: "demo", backendNote: "",
    followUp: [],
  },

  // ---- C. Operator 实验室（13） ----
  {
    group: "operatorLabGroup", label: "经营工作台", key: "workbench",
    responsibility: "Operator 实验室的默认落地页，一屏汇总今日经营状态和四个高频入口的快捷卡片。",
    sections: ["今日经营概览", "店铺状态", "待处理订单", "客服消息", "营销任务", "广告建议", "利润提醒", "Operator 秘书建议", "待审批事项"],
    file: "src/console/labs/operatorLabV2/pages/WorkbenchPage.jsx",
    backend: "demo", backendNote: "",
    followUp: [],
  },
  {
    group: "operatorLabGroup", label: "商品中心", key: "products",
    responsibility: "商品的全生命周期管理：状态、库存、定价、内容完成度、多渠道上架。",
    sections: ["商品列表", "商品状态", "SKU", "库存", "售价", "成本", "毛利", "渠道", "内容完成度", "上架状态", "新增商品", "编辑商品"],
    file: "src/console/modules/productCenter/ProductCenterModule.jsx（经 DirectModuleRedirect 复用 Founder 顶层模块）",
    backend: "demo", backendNote: "",
    followUp: [],
  },
  {
    group: "operatorLabGroup", label: "订单中心", key: "orders",
    responsibility: "订单的筛选、发货、售后与利润追踪。",
    sections: ["订单列表", "订单状态", "渠道", "客户", "商品", "金额", "支付", "发货", "售后", "退款", "利润影响", "订单详情"],
    file: "src/console/modules/orderCenter/OrderCenterModule.jsx（经 DirectModuleRedirect 复用 Founder 顶层模块）",
    backend: "demo", backendNote: "",
    followUp: [],
  },
  {
    group: "operatorLabGroup", label: "客户中心", key: "customers",
    responsibility: "客户分层、来源、消费与跟进状态管理。",
    sections: ["客户列表", "客户分层", "来源渠道", "最近购买", "累计消费", "意向", "标签", "跟进状态", "客户详情"],
    file: "src/console/labs/operatorLabV2/pages/CustomersPage.jsx",
    backend: "demo", backendNote: "",
    followUp: [],
  },
  {
    group: "operatorLabGroup", label: "客服中心", key: "customerService",
    responsibility: "AI 接待 + 人工接管的客服会话中心，覆盖售前/售后/投诉/风险消息。",
    sections: ["会话列表", "AI 接待", "人工接管", "待回复", "售前", "售后", "投诉", "风险消息", "推荐回复", "会话详情"],
    file: "src/console/modules/customerServiceCenter/CustomerServiceCenterModule.jsx（经 DirectModuleRedirect 复用 Founder 顶层模块）",
    backend: "demo", backendNote: "",
    followUp: [],
  },
  {
    group: "operatorLabGroup", label: "营销中心", key: "marketing",
    responsibility: "营销活动策划与内容需求提报，是 Operator 向 Studio 提需求的入口。",
    sections: ["营销活动", "优惠方案", "内容需求", "活动日历", "人群", "渠道", "预算", "效果", "创建活动", "提交内容需求到 Studio"],
    file: "src/console/labs/operatorLabV2/pages/MarketingPage.jsx",
    backend: "demo", backendNote: "",
    followUp: [],
  },
  {
    group: "operatorLabGroup", label: "广告投放", key: "adOps",
    responsibility: "AI 投放建议的审批与广告计划执行跟踪。",
    sections: ["AI 投放建议", "广告计划", "投放平台", "目标人群", "预算", "素材", "预计效果", "待经营者批准", "批准/驳回/暂停", "投放结果", "复盘"],
    file: "src/console/labs/operatorLabV2/pages/AdOpsPage.jsx",
    backend: "demo", backendNote: "",
    followUp: [],
  },
  {
    group: "operatorLabGroup", label: "品牌中心", key: "brand",
    responsibility: "品牌定位、商品线与品牌一致性检查，通往 Studio 品牌资产的入口。",
    sections: ["品牌概览", "品牌定位", "商品线", "品牌资产", "品牌一致性", "内容使用情况", "品牌授权", "品牌问题", "进入 Studio 品牌资产"],
    file: "src/console/labs/operatorLabV2/pages/BrandPage.jsx",
    backend: "demo", backendNote: "",
    followUp: [],
  },
  {
    group: "operatorLabGroup", label: "Operator 秘书", key: "aiSecretary",
    responsibility: "只负责经营 Runtime 的 AI 秘书，和 Founder 今日总览的秘书、Studio 秘书是三个不同范围的实现。",
    sections: ["今日建议", "经营异常", "利润建议", "广告建议", "商品建议", "客服建议", "待审批事项", "执行记录", "接受/驳回建议"],
    file: "src/console/labs/operatorLabV2/pages/AiSecretaryWorkbenchPage.jsx",
    backend: "demo", backendNote: "",
    followUp: [],
  },
  {
    group: "operatorLabGroup", label: "数据中心", key: "analytics",
    responsibility: "销售/商品/客户/订单/广告/内容/渠道多维数据分析。",
    sections: ["销售数据", "商品数据", "客户数据", "订单数据", "广告数据", "内容数据", "渠道数据", "趋势", "对比", "数据导出"],
    file: "src/console/labs/operatorLabV2/pages/AnalyticsPage.jsx",
    backend: "demo", backendNote: "",
    followUp: [],
  },
  {
    group: "operatorLabGroup", label: "财务与利润", key: "financeProfit",
    responsibility: "从收入到净经营利润的完整财务视图，含 Token 成本在内的全部成本项。",
    sections: ["销售收入", "商品成本", "平台费用", "广告费用", "Token 成本", "退款", "毛利润", "净经营利润", "利润趋势", "商品/店铺/订单利润"],
    file: "src/console/labs/operatorLabV2/pages/FinanceProfitPage.jsx",
    backend: "demo", backendNote: "",
    followUp: [],
  },
  {
    group: "operatorLabGroup", label: "组织与审批", key: "organization",
    responsibility: "团队成员、AI 角色权限与审批流程、自动经营规则管理。",
    sections: ["成员", "AI 角色", "职责", "权限", "审批流程", "待审批", "已审批", "异常事项", "自动经营规则", "人工接管"],
    file: "src/console/labs/operatorLabV2/pages/OrganizationPage.jsx",
    backend: "demo", backendNote: "",
    followUp: [],
  },
  {
    group: "operatorLabGroup", label: "经营设置", key: "settings",
    responsibility: "店铺管理、平台连接、通知与安全设置——只暴露经营者能理解的业务化信息，不暴露技术连接器细节。",
    sections: ["店铺管理", "平台连接", "店铺授权", "同步状态", "经营规则", "通知设置", "时区与语言", "数据权限", "安全设置"],
    file: "src/console/labs/operatorLabV2/pages/SettingsWorkbenchPage.jsx（Tabs：设置/店铺管理/平台连接）",
    backend: "partial", backendNote: "店铺管理 Tab（ShopCenterContent）的店铺列表读真实后端 /api/v1/shops。",
    followUp: [],
  },

  // ---- D. Studio 实验室（13） ----
  {
    group: "studioLabGroup", label: "Studio 工作台", key: "workspace",
    responsibility: "Studio 的项目总览、生产队列、日历与审核队列——不拥有生产流水线本身。",
    sections: ["项目概览", "生产队列", "内容日历", "任务分配", "审核队列", "截止时间", "跨项目状态", "Studio 秘书建议"],
    file: "src/studio/pages/WorkspacePage.jsx（Tabs：总览/秘书/项目队列/选题与热点）",
    backend: "demo", backendNote: "",
    followUp: [],
  },
  {
    group: "studioLabGroup", label: "AI 短剧", key: "shortDrama",
    responsibility: "短剧内容的十阶段端到端生产流水线。",
    sections: ["项目列表", "创意", "剧本", "分镜", "角色", "场景", "配音", "视频生成", "字幕", "审核", "发布交接", "版本", "预览"],
    file: "src/studio/pages/ShortDramaWorkbench.jsx（选中项目后进入 DirectorWorkspace.jsx 十阶段流水线）",
    backend: "demo", backendNote: "",
    followUp: [],
  },
  {
    group: "studioLabGroup", label: "AI 视频", key: "aiVideo",
    responsibility: "通用视频内容的生产流水线。",
    sections: ["视频项目", "创意简报", "脚本", "镜头清单", "素材", "视频生成", "剪辑", "配音与字幕", "审核", "发布交接", "版本", "预览"],
    file: "src/studio/pages/AiVideoWorkbench.jsx",
    backend: "demo", backendNote: "",
    followUp: [],
  },
  {
    group: "studioLabGroup", label: "AI 图片", key: "graphicContent",
    responsibility: "图文内容的生产流水线。",
    sections: ["图片项目", "需求简报", "参考素材", "Prompt", "生成设置", "候选图片", "编辑", "对比", "审核", "保存素材库", "版本", "成本"],
    file: "src/studio/pages/AiImageWorkbench.jsx（GraphicContentListPage + GraphicContentEditorPage）",
    backend: "demo", backendNote: "",
    followUp: [],
  },
  {
    group: "studioLabGroup", label: "AI 文章", key: "aiArticle",
    responsibility: "图文/长文内容的研究到发布流水线。",
    sections: ["文章项目", "研究资料", "大纲", "初稿", "改写", "SEO 与平台适配", "审核", "发布交接", "版本", "引用来源", "成本"],
    file: "src/studio/pages/AiArticleWorkbench.jsx",
    backend: "demo", backendNote: "",
    followUp: [],
  },
  {
    group: "studioLabGroup", label: "AI 直播", key: "aiLive",
    responsibility: "直播内容的选题到带货复盘流水线。",
    sections: ["直播项目", "直播主题", "商品清单", "直播脚本", "排练", "直播控制台框架", "AI 主播", "实时提示", "带货数据", "复盘", "发布切片"],
    file: "src/studio/pages/AiLiveWorkbench.jsx",
    backend: "demo", backendNote: "",
    followUp: [],
  },
  {
    group: "studioLabGroup", label: "AI 音频", key: "aiAudio",
    responsibility: "音频内容（配音/播客等）的生产流水线。",
    sections: ["音频项目", "文稿", "音色", "配音", "背景音乐", "音效", "时间轴", "试听", "审核", "导出", "版本", "成本"],
    file: "src/studio/pages/AiAudioWorkbench.jsx",
    backend: "demo", backendNote: "",
    followUp: [],
  },
  {
    group: "studioLabGroup", label: "矩阵账号", key: "matrixAccounts",
    responsibility: "多平台矩阵账号的健康度、授权与发布频率管理。",
    sections: ["账号列表", "平台", "账号状态", "粉丝", "内容数量", "授权状态", "账号定位", "发布频率", "风险状态", "账号详情"],
    file: "src/studio/pages/MatrixAssetPages.jsx 的 MatrixAccountsPage",
    backend: "demo", backendNote: "",
    followUp: [],
  },
  {
    group: "studioLabGroup", label: "发布中心", key: "publishingCenter",
    responsibility: "内容跨平台发布状态、审核状态、流量与广告资源的统一调度。",
    sections: ["待发布", "发布中", "已发布", "发布失败", "平台", "账号", "发布时间", "内容版本", "审核状态", "流量资源", "广告资源", "发布记录"],
    file: "src/studio/pages/PublishingCenterPage.jsx",
    backend: "demo", backendNote: "",
    followUp: [],
  },
  {
    group: "studioLabGroup", label: "素材库", key: "assetLibrary",
    responsibility: "图片/视频/音频/文档/模板等全部素材资产的统一库。",
    sections: ["图片", "视频", "音频", "文档", "模板", "商品素材", "项目素材", "标签", "来源", "授权", "使用记录", "搜索与筛选"],
    file: "src/studio/pages/AssetLibraryPage.jsx（Tabs：内容资产/能力市场）",
    backend: "demo", backendNote: "",
    followUp: [],
  },
  {
    group: "studioLabGroup", label: "品牌资产", key: "brandAssets",
    responsibility: "品牌规范、视觉资产与 IP 角色的统一管理。",
    sections: ["品牌规范", "Logo", "字体", "色彩", "商品视觉", "模板", "品牌故事", "IP 角色", "授权合作", "使用规则", "一致性检查"],
    file: "src/studio/pages/BrandAssetsPage.jsx",
    backend: "demo", backendNote: "",
    followUp: [],
  },
  {
    group: "studioLabGroup", label: "内容数据", key: "analytics",
    responsibility: "内容生产、发布与变现效果的多维数据分析。",
    sections: ["内容产量", "发布数量", "播放", "阅读", "互动", "转化", "收益", "成本", "Token 使用", "平台对比", "内容类型对比", "项目复盘"],
    file: "src/studio/pages/AnalyticsWorkbench.jsx",
    backend: "demo", backendNote: "",
    followUp: [],
  },
  {
    group: "studioLabGroup", label: "Studio 设置", key: "settings",
    responsibility: "平台连接、审核规则、品牌规则与成本限制等 Studio 侧配置。",
    sections: ["平台连接", "矩阵账号权限", "内容审核规则", "发布规则", "品牌规则", "素材权限", "通知设置", "成本限制", "生成偏好"],
    file: "src/studio/pages/SettingsWorkbench.jsx",
    backend: "demo", backendNote: "",
    followUp: [],
  },

  // ---- E. Cloud Center（10） ----
  {
    group: "cloudCenterGroup", label: "设备管理", key: "devices",
    responsibility: "设备群（Mac mini）的健康度、版本、许可证与 Token 状态总览，是 Cloud Center 的核心台账。",
    sections: ["设备列表", "Operator", "设备编号", "设备型号", "在线状态", "当前版本", "许可证", "Token 状态", "最近心跳", "告警", "远程操作入口"],
    file: "src/cloud/cloudPages.jsx 的 DevicesWorkbenchPage",
    backend: "demo", backendNote: "",
    followUp: [],
  },
  {
    group: "cloudCenterGroup", label: "OTA 更新", key: "otaSupport",
    responsibility: "版本更新包的灰度发布、进度跟踪与回滚。",
    sections: ["更新包", "目标版本", "发布通道", "目标设备", "灰度比例", "更新时间", "更新进度", "失败设备", "暂停/继续/回滚"],
    file: "src/cloud/cloudPages.jsx 的 OtaSupportPage",
    backend: "demo", backendNote: "",
    followUp: [],
  },
  {
    group: "cloudCenterGroup", label: "许可证", key: "licenses",
    responsibility: "Operator 许可证套餐、授权能力与到期状态管理。",
    sections: ["许可证列表", "Operator", "设备", "版本", "授权能力", "生效时间", "到期时间", "状态", "暂停/续期/转移"],
    file: "src/cloud/cloudPages.jsx 的 LicensesPage",
    backend: "demo", backendNote: "",
    followUp: [],
  },
  {
    group: "cloudCenterGroup", label: "Token 中心", key: "cloudToken",
    responsibility: "全平台 Token 消耗计量与授予/充值的统一入口。",
    sections: ["Token 套餐", "购买记录", "分配", "Operator", "设备", "使用量", "余额", "成本", "预警", "充值/调整额度"],
    file: "src/console/modules/cloudToken/CloudTokenModule.jsx（Tabs：Token 计量/Token 授予与充值）",
    backend: "demo", backendNote: "",
    followUp: [],
  },
  {
    group: "cloudCenterGroup", label: "Marketplace", key: "marketplaceCenter",
    responsibility: "Founder 视角的能力市场管理中心，可见草稿/审核中/第三方全部提交，不做过滤。",
    sections: ["应用", "Agent", "Prompt", "Skill", "Workflow", "Connector", "模板", "行业方案", "发布", "审核", "安装", "升级", "评分", "收益"],
    file: "src/console/labs/MarketplaceCenter.jsx",
    backend: "demo", backendNote: "",
    followUp: [],
  },
  {
    group: "cloudCenterGroup", label: "版本管理", key: "cloudVersion",
    responsibility: "Founder/Operator/Studio/Cloud 四个产品各自的版本发布通道管理。",
    sections: ["Founder 版本", "Operator 版本", "Studio 版本", "Cloud 版本", "发布通道", "测试版本", "灰度版本", "正式版本", "版本说明", "依赖", "发布/回滚"],
    file: "src/console/modules/cloudVersion/CloudVersionModule.jsx",
    backend: "demo", backendNote: "",
    followUp: [],
  },
  {
    group: "cloudCenterGroup", label: "资产管理", key: "cloudAssets",
    responsibility: "安装包、模型资源、模板资源等分发资产的版本与校验状态管理。",
    sections: ["安装包", "配置包", "模型资源", "模板资源", "内容资源", "依赖关系", "版本", "大小", "校验状态", "发布状态"],
    file: "src/console/modules/cloudAssets/CloudAssetsModule.jsx",
    backend: "demo", backendNote: "",
    followUp: [],
  },
  {
    group: "cloudCenterGroup", label: "节点调度", key: "distributedScheduling",
    responsibility: "未来分布式调度经营者 Mac mini 空闲算力的架构预留能力展示，当前全部只读演示。",
    sections: ["节点列表", "位置", "设备", "算力", "当前任务", "队列", "负载", "状态", "调度策略", "分配任务/暂停节点"],
    file: "src/cloud/cloudPages.jsx 的 DistributedSchedulingPage",
    backend: "demo", backendNote: "distributedCompute.enabled 恒为 false，明确标注未来能力。",
    followUp: [],
  },
  {
    group: "cloudCenterGroup", label: "系统监控", key: "monitoring",
    responsibility: "设备群总览指标 + 本机（Mac mini）硬件/容器运行状态。",
    sections: ["服务状态", "设备在线率", "请求量", "错误率", "Token 使用", "任务队列", "节点负载", "告警", "事件", "处理状态"],
    file: "src/console/modules/monitoring/MonitoringModule.jsx（Tabs：总览/服务状态，总览复用 cloud/cloudPages.jsx 的 OverviewPage）",
    backend: "partial", backendNote: "服务状态 Tab 的 AI 运营系统状态（RuntimeStatusPanel）读真实后端。",
    followUp: [],
  },
  {
    group: "cloudCenterGroup", label: "日志中心", key: "logs",
    responsibility: "设备/OTA/Token/许可证/安全/操作全量日志的检索中心。",
    sections: ["系统日志", "设备日志", "OTA 日志", "Token 日志", "许可证日志", "安全日志", "操作日志", "错误日志", "搜索", "筛选", "详情", "关联事件"],
    file: "src/console/modules/logs/LogsModule.jsx",
    backend: "demo", backendNote: "",
    followUp: [],
  },
];

export function getReviewSummary() {
  const total = REVIEW_PAGES.length;
  const byGroup = REVIEW_GROUPS.map((g) => ({
    ...g,
    actual: REVIEW_PAGES.filter((p) => p.group === g.key).length,
  }));
  const backendPartialOrLive = REVIEW_PAGES.filter((p) => p.backend !== "demo").length;
  return { total, byGroup, backendPartialOrLive, demoOnly: total - backendPartialOrLive };
}
