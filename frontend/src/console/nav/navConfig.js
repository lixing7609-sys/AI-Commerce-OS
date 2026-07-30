import { CAPABILITY_KEYS } from "../capabilities.js";

/**
 * 模块的唯一权威列表：侧边栏、导航状态、页面渲染表都从这里读取，
 * 不在别处重复定义模块 key。
 *
 * 阶段 Founder Master Edition V1.0（架构重置，见
 * docs/architecture/Founder_Master_Edition_Development_Charter.md /
 * ADR-0007）：一级导航收口为冻结的五组——Founder Workspace /
 * AI Capability Center / Operator Lab / Studio Lab / Cloud Center。
 * 之前的十一组（Founder工作台 / Agent中心 / Prompt中心 / Skill中心 /
 * Workflow中心 / Knowledge中心 / Connector中心 / Capability中心 /
 * Operator 实验室 / Studio 实验室 / Cloud Center，2798e74 引入）被
 * 折叠迁移，不是删除功能：
 *   - Founder工作台 → Founder Workspace 的 "Today" 子项（新增
 *     Decisions/Development/Business Validation/Content Validation/
 *     Cloud Status/Risks/Notifications 见 Founder Workspace 相关模块）
 *   - Agent中心/Prompt中心/Skill中心/Workflow中心/Knowledge中心/
 *     Connector中心/Capability中心 七个顶级分组 → 折叠进一个
 *     AI Capability Center 手风琴分组，各自成为分组内的 7 个子项
 *     （Agent Center/Prompt Center/Skill Center/Workflow Center/
 *     Knowledge Center/Connector Center/Capability Center），复用
 *     ConsoleSidebar.jsx 既有的 Labs/Cloud 手风琴机制
 *     （LABS_CLOUD_GROUP_KEYS 等），不是新写一套渲染逻辑。
 *   - Agent 工作室/模型路由/自动化策略/回放中心/基准测试中心/评估
 *     中心/广告策略研发 七个原子模块 key 保留注册（`hiddenFromSidebar:
 *     true`，内部标签页/详情跳转大量自我引用，不能改名或去掉注册），
 *     现在作为 Agent Center / Workflow Center / Capability Center
 *     三个新组合模块内部的 Tab 渲染，见对应 *Module.jsx 顶部注释。
 *   - 原"Studio 实验控制层"11 个 Founder 专属尾部条目（studioAgents
 *     …studioReleases，曾经挂在 studioLabGroup 的
 *     externalPosition="after"）→ 不再是 Studio Lab 自己导航树下的
 *     未说明尾部分组（Studio 是消费 AI 能力的编辑版，不应该带着
 *     Founder 自己的能力研发工具），全部吸收进 AI Capability Center
 *     对应子中心的 "Studio 作用域" Tab（Agent/Prompt/Skill/Workflow/
 *     Capability Center 五个组合模块内部），group 字段改为
 *     aiCapabilityCenterGroup，key 本身未变，旧深链仍可解析。
 *   - Prompt中心/Skill中心/Knowledge中心/Connector中心的既有实现
 *     （`console/shared/assetDomain.js` + `console/kit/
 *     AssetCenterModule.jsx` 通用列表/详情/新建/编辑骨架）未改动，
 *     只是 group 字段迁移；Prompt/Skill Center 额外包一层
 *     *Workbench.jsx 把 Studio 作用域 Tab 加进去，注册的模块 key
 *     不变（`promptCenter`/`skillCenter`），因为 AssetCenterModule
 *     内部自我引用的 moduleKey 就是这两个 key 本身。
 *   - Operator Lab（原 Operator 实验室）/ Studio Lab（原 Studio
 *     实验室）/ Cloud Center 三个分组的 external registry 机制不变，
 *     内部二级导航按 Charter §3.3–3.5 重新收口（各自模块内单独说明）。
 */
export const FOUNDER_MODULES = [
  {
    // Design DNA v1.0 internal showcase (docs/01-foundation/design/).
    // Not a customer nav item — reachable only via ?module=designDna,
    // same hiddenFromSidebar pattern already used for productCenter/
    // orderCenter/etc above.
    key: "designDna",
    label: "Design DNA Showcase",
    group: "founderWorkspaceGroup",
    icon: "◆",
    requiredCapability: CAPABILITY_KEYS.DESIGN_DNA_VIEW,
    hiddenFromSidebar: true,
  },
  {
    // 产品审查模式（Founder Master Edition V1.0 中文框架审查版
    // §六）——不是 51 个产品页面之一，是供产品负责人审查这 51 个
    // 页面的元工具，走顶部工具栏"产品审查"按钮进入，同 designDna
    // 一样不占用任何一个顶层分组的可见子项名额。
    key: "productReview",
    label: "产品审查",
    group: "founderWorkspaceGroup",
    icon: "☑",
    requiredCapability: CAPABILITY_KEYS.PRODUCT_REVIEW_VIEW,
    hiddenFromSidebar: true,
  },
  {
    key: "founderWorkbench",
    label: "今日总览",
    group: "founderWorkspaceGroup",
    icon: "✦",
    requiredCapability: CAPABILITY_KEYS.FOUNDER_WORKBENCH_VIEW,
    isDefault: true,
  },
  {
    key: "decisions",
    label: "决策中心",
    group: "founderWorkspaceGroup",
    icon: "☑",
    requiredCapability: CAPABILITY_KEYS.DECISIONS_VIEW,
  },
  {
    key: "development",
    label: "开发进度",
    group: "founderWorkspaceGroup",
    icon: "⌘",
    requiredCapability: CAPABILITY_KEYS.DEVELOPMENT_VIEW,
  },
  {
    key: "businessValidation",
    label: "经营验证",
    group: "founderWorkspaceGroup",
    icon: "▥",
    requiredCapability: CAPABILITY_KEYS.BUSINESS_VALIDATION_VIEW,
  },
  {
    key: "contentValidation",
    label: "内容验证",
    group: "founderWorkspaceGroup",
    icon: "◆",
    requiredCapability: CAPABILITY_KEYS.CONTENT_VALIDATION_VIEW,
  },
  {
    key: "cloudStatus",
    label: "云端状态",
    group: "founderWorkspaceGroup",
    icon: "☁",
    requiredCapability: CAPABILITY_KEYS.CLOUD_STATUS_VIEW,
  },
  {
    key: "risks",
    label: "风险中心",
    group: "founderWorkspaceGroup",
    icon: "⚑",
    requiredCapability: CAPABILITY_KEYS.RISKS_VIEW,
  },
  {
    key: "notifications",
    label: "通知中心",
    group: "founderWorkspaceGroup",
    icon: "◔",
    requiredCapability: CAPABILITY_KEYS.NOTIFICATIONS_VIEW,
  },
  {
    key: "agentCenter",
    label: "Agent 中心",
    group: "aiCapabilityCenterGroup",
    icon: "⚙",
    requiredCapability: CAPABILITY_KEYS.AGENT_CENTER_VIEW,
  },
  {
    key: "agentStudio",
    label: "Agent 工作室",
    group: "aiCapabilityCenterGroup",
    icon: "⚙",
    requiredCapability: CAPABILITY_KEYS.AGENT_STUDIO_VIEW,
    hiddenFromSidebar: true,
  },
  {
    key: "modelRouter",
    label: "模型路由",
    group: "aiCapabilityCenterGroup",
    icon: "⇆",
    requiredCapability: CAPABILITY_KEYS.MODEL_ROUTER_VIEW,
    hiddenFromSidebar: true,
  },
  {
    key: "promptCenter",
    label: "Prompt 中心",
    group: "aiCapabilityCenterGroup",
    icon: "✎",
    requiredCapability: CAPABILITY_KEYS.PROMPT_CENTER_VIEW,
  },
  {
    key: "skillCenter",
    label: "Skill 中心",
    group: "aiCapabilityCenterGroup",
    icon: "🧩",
    requiredCapability: CAPABILITY_KEYS.SKILL_CENTER_VIEW,
  },
  {
    key: "workflowCenter",
    label: "Workflow 中心",
    group: "aiCapabilityCenterGroup",
    icon: "☲",
    requiredCapability: CAPABILITY_KEYS.WORKFLOW_CENTER_VIEW,
  },
  {
    key: "automationPolicy",
    label: "自动化策略",
    group: "aiCapabilityCenterGroup",
    icon: "☲",
    requiredCapability: CAPABILITY_KEYS.AUTOMATION_POLICY_VIEW,
    hiddenFromSidebar: true,
  },
  {
    key: "replayCenter",
    label: "回放中心",
    group: "aiCapabilityCenterGroup",
    icon: "↻",
    requiredCapability: CAPABILITY_KEYS.REPLAY_CENTER_VIEW,
    hiddenFromSidebar: true,
  },
  {
    key: "knowledgeCenter",
    label: "知识中心",
    group: "aiCapabilityCenterGroup",
    icon: "▤",
    requiredCapability: CAPABILITY_KEYS.KNOWLEDGE_CENTER_VIEW,
  },
  {
    key: "connectorCenter",
    label: "Connector 中心",
    group: "aiCapabilityCenterGroup",
    icon: "⛓",
    requiredCapability: CAPABILITY_KEYS.CONNECTOR_CENTER_VIEW,
  },
  {
    key: "capabilityCenter",
    label: "能力中心",
    group: "aiCapabilityCenterGroup",
    icon: "◈",
    requiredCapability: CAPABILITY_KEYS.CAPABILITY_CENTER_VIEW,
  },
  {
    key: "benchmarkCenter",
    label: "基准测试中心",
    group: "aiCapabilityCenterGroup",
    icon: "⚑",
    requiredCapability: CAPABILITY_KEYS.BENCHMARK_CENTER_VIEW,
    hiddenFromSidebar: true,
  },
  {
    key: "evaluationCenter",
    label: "评估中心",
    group: "aiCapabilityCenterGroup",
    icon: "★",
    requiredCapability: CAPABILITY_KEYS.EVALUATION_CENTER_VIEW,
    hiddenFromSidebar: true,
  },
  {
    key: "adCenter",
    label: "广告策略研发",
    group: "aiCapabilityCenterGroup",
    icon: "■",
    requiredCapability: CAPABILITY_KEYS.AD_CENTER_VIEW,
    founderOnly: true,
    hiddenFromSidebar: true,
  },
  {
    key: "operatorLab",
    label: "Operator 实验室",
    group: "operatorLabGroup",
    icon: "▣",
    requiredCapability: CAPABILITY_KEYS.OPERATOR_LAB_VIEW,
  },
  // 下面四个模块 key 必须继续注册（不能只留在 MODULE_REDIRECTS
  // 里）——ProductCenterModule/OrderCenterModule/
  // CustomerServiceCenterModule/ApprovalCenterModule 内部大量标签页/
  // 详情跳转直接写死 `navigate("orderCenter", {subView:...})` 这类
  // 自我引用（例如 CustomerServiceCenterModule 的 8 个标签、
  // OrderCenterModule 的详情深链），如果这里改成重定向或者干脆不注册，
  // 这些组件内部的标签切换会失效。`hiddenFromSidebar: true` 让
  // ConsoleSidebar 不把它们渲染成 operatorLabGroup 里的按钮（这正是
  // 之前四个"该模块尚未和 Operator 实验室完成单一真源合并"重复警告
  // 按钮的来源），但 Operator 实验室 v2 registry 仍然直接 import 同一
  // 个组件作为"商品/订单/客服/审批"四个子项的真实实现，两条路径渲染
  // 的是同一份组件，不是两份重复实现。
  {
    key: "productCenter", label: "商品中心", group: "operatorLabGroup", icon: "▤",
    requiredCapability: CAPABILITY_KEYS.PRODUCT_CENTER_VIEW, hiddenFromSidebar: true,
  },
  {
    key: "orderCenter", label: "订单中心", group: "operatorLabGroup", icon: "▥",
    requiredCapability: CAPABILITY_KEYS.ORDER_CENTER_VIEW, hiddenFromSidebar: true,
  },
  {
    key: "customerServiceCenter", label: "客服中心", group: "operatorLabGroup", icon: "⟲",
    requiredCapability: CAPABILITY_KEYS.CUSTOMER_SERVICE_CENTER_VIEW, hiddenFromSidebar: true,
  },
  {
    key: "approvalCenter", label: "审批中心", group: "operatorLabGroup", icon: "☑",
    requiredCapability: CAPABILITY_KEYS.APPROVAL_CENTER_VIEW, hiddenFromSidebar: true,
  },
  {
    key: "studioLab",
    label: "Studio 实验室",
    group: "studioLabGroup",
    icon: "◆",
    requiredCapability: CAPABILITY_KEYS.STUDIO_LAB_VIEW,
  },
  // 原"Studio 实验控制层"——吸收进 AI Capability Center 对应子中心的
  // Studio 作用域 Tab（Agent/Prompt/Skill/Workflow/Capability Center，
  // 见各自 *Module.jsx / *Workbench.jsx），不再是 Studio Lab 导航树的
  // 尾部分组。key 不变，仍可通过旧深链解析。
  {
    key: "studioAgents", label: "Studio Agent", group: "aiCapabilityCenterGroup", icon: "⚙",
    requiredCapability: CAPABILITY_KEYS.STUDIO_LAB_EXPERIMENT_VIEW, founderOnly: true, hiddenFromSidebar: true,
  },
  {
    key: "studioPrompts", label: "Studio Prompt", group: "aiCapabilityCenterGroup", icon: "✎",
    requiredCapability: CAPABILITY_KEYS.STUDIO_LAB_EXPERIMENT_VIEW, founderOnly: true, hiddenFromSidebar: true,
  },
  {
    key: "studioSkills", label: "Studio Skill", group: "aiCapabilityCenterGroup", icon: "🧩",
    requiredCapability: CAPABILITY_KEYS.STUDIO_LAB_EXPERIMENT_VIEW, founderOnly: true, hiddenFromSidebar: true,
  },
  {
    key: "studioWorkflows", label: "Studio Workflow", group: "aiCapabilityCenterGroup", icon: "⇄",
    requiredCapability: CAPABILITY_KEYS.STUDIO_LAB_EXPERIMENT_VIEW, founderOnly: true, hiddenFromSidebar: true,
  },
  {
    key: "studioModelRouting", label: "Studio 模型路由", group: "aiCapabilityCenterGroup", icon: "⇆",
    requiredCapability: CAPABILITY_KEYS.STUDIO_LAB_EXPERIMENT_VIEW, founderOnly: true, hiddenFromSidebar: true,
  },
  {
    key: "studioPromptTest", label: "Prompt测试台", group: "aiCapabilityCenterGroup", icon: "⚑",
    requiredCapability: CAPABILITY_KEYS.STUDIO_LAB_EXPERIMENT_VIEW, founderOnly: true, hiddenFromSidebar: true,
  },
  {
    key: "studioReplay", label: "真实任务回放", group: "aiCapabilityCenterGroup", icon: "↻",
    requiredCapability: CAPABILITY_KEYS.STUDIO_LAB_EXPERIMENT_VIEW, founderOnly: true, hiddenFromSidebar: true,
  },
  {
    key: "studioEvaluation", label: "A/B评测", group: "aiCapabilityCenterGroup", icon: "★",
    requiredCapability: CAPABILITY_KEYS.STUDIO_LAB_EXPERIMENT_VIEW, founderOnly: true, hiddenFromSidebar: true,
  },
  {
    key: "studioLogs", label: "运行日志", group: "aiCapabilityCenterGroup", icon: "▤",
    requiredCapability: CAPABILITY_KEYS.STUDIO_LAB_EXPERIMENT_VIEW, founderOnly: true, hiddenFromSidebar: true,
  },
  {
    key: "studioCosts", label: "成本分析", group: "aiCapabilityCenterGroup", icon: "◉",
    requiredCapability: CAPABILITY_KEYS.STUDIO_LAB_EXPERIMENT_VIEW, founderOnly: true, hiddenFromSidebar: true,
  },
  {
    key: "studioReleases", label: "版本与发布", group: "aiCapabilityCenterGroup", icon: "⛁",
    requiredCapability: CAPABILITY_KEYS.STUDIO_LAB_EXPERIMENT_VIEW, founderOnly: true, hiddenFromSidebar: true,
  },
  {
    key: "cloudCenter",
    label: "Cloud Center",
    group: "cloudCenterGroup",
    icon: "☁",
    requiredCapability: CAPABILITY_KEYS.CLOUD_CENTER_VIEW,
  },
  // Cloud Center 的 Founder 组合尾部条目（Charter §3.5，6 项）——
  // Devices/OTA/License/Nodes 四项原生来自 cloud/navConfig.js 共享
  // registry（见 ConsoleSidebar.jsx 的 externalPosition="after"），
  // 这里补齐 Token/Marketplace/Version/Assets/Monitoring/Logs 六项，
  // 让 Founder 的 Cloud Center 手风琴凑齐 Charter 冻结的 10 个子项。
  // tokenCenter/systemCenter 两个旧 key 保留注册+hiddenFromSidebar，
  // 供旧深链解析（内部标签/详情跳转自我引用，见各自组件顶部注释）。
  {
    key: "cloudToken",
    label: "Token 中心",
    group: "cloudCenterGroup",
    icon: "◉",
    requiredCapability: CAPABILITY_KEYS.TOKEN_CENTER_VIEW,
  },
  {
    key: "tokenCenter",
    label: "Token 中心",
    group: "cloudCenterGroup",
    icon: "◉",
    requiredCapability: CAPABILITY_KEYS.TOKEN_CENTER_VIEW,
    hiddenFromSidebar: true,
  },
  {
    key: "marketplaceCenter",
    label: "Marketplace",
    group: "cloudCenterGroup",
    icon: "⛁",
    requiredCapability: CAPABILITY_KEYS.MARKETPLACE_CENTER_VIEW,
  },
  {
    key: "cloudVersion",
    label: "版本管理",
    group: "cloudCenterGroup",
    icon: "⛭",
    requiredCapability: CAPABILITY_KEYS.CLOUD_VERSION_VIEW,
  },
  {
    key: "cloudAssets",
    label: "资产管理",
    group: "cloudCenterGroup",
    icon: "▤",
    requiredCapability: CAPABILITY_KEYS.CLOUD_ASSETS_VIEW,
  },
  {
    key: "monitoring",
    label: "系统监控",
    group: "cloudCenterGroup",
    icon: "◈",
    requiredCapability: CAPABILITY_KEYS.MONITORING_VIEW,
  },
  {
    key: "logs",
    label: "日志中心",
    group: "cloudCenterGroup",
    icon: "▤",
    requiredCapability: CAPABILITY_KEYS.LOGS_VIEW,
  },
  {
    key: "systemCenter",
    label: "系统中心",
    group: "cloudCenterGroup",
    icon: "⚙⚙",
    requiredCapability: CAPABILITY_KEYS.SYSTEM_CENTER_VIEW,
    hiddenFromSidebar: true,
  },
];

/**
 * 五个冻结的一级分组（Founder Master Edition V1.0 Charter §3）。
 * `collapsible: true` 的分组渲染成手风琴（单一展开）——`external`
 * 标记该分组的子项来自哪个共享 registry，由 ConsoleSidebar 直接
 * import 对应产品的 NAV_ITEMS 渲染，不手写第二份导航数组。
 * "Founder Workspace"不折叠（默认页所在分组，Mission Control 需要
 * 一直可见）。AI Capability Center 是原生分组（没有 external
 * registry），复用 ConsoleSidebar.jsx 的 Labs/Cloud 手风琴渲染函数
 * （renderLabsCloudGroup）——见该文件 LABS_CLOUD_GROUP_KEYS。
 */
export const NAV_GROUPS = [
  { key: "founderWorkspaceGroup", label: "Founder 工作台", collapsible: false },
  { key: "aiCapabilityCenterGroup", label: "AI 能力中心", collapsible: true },
  { key: "operatorLabGroup", label: "Operator 实验室", collapsible: true, external: "operatorV2", externalPosition: "before" },
  { key: "studioLabGroup", label: "Studio 实验室", collapsible: true, external: "studio", externalPosition: "before" },
  { key: "cloudCenterGroup", label: "Cloud Center", collapsible: true, external: "cloud", externalPosition: "before" },
];

/**
 * Design DNA v1.1 navigation shell (docs/01-foundation/design/
 * navigation-shell-spec.md) — purely presentational grouping layer on
 * top of NAV_GROUPS, for the sidebar's visual zones. Updated for the
 * Founder Master Edition five-group reset: "workspace" holds Mission
 * Control (flat, no accordion); "production" holds the three
 * accordion groups that consume/produce AI capability (AI Capability
 * Center, Operator Lab, Studio Lab); "cloud" holds Cloud Center alone.
 * ConsoleSidebar.jsx dispatches rendering per-group via
 * LABS_CLOUD_GROUP_KEYS membership, not by zone key, so this layer is
 * purely cosmetic grouping/labeling and can't desync module behavior.
 */
export const NAV_ZONES = [
  { key: "workspace", label: "Founder 工作台", groups: ["founderWorkspaceGroup"] },
  { key: "production", label: "能力与实验室", groups: ["aiCapabilityCenterGroup", "operatorLabGroup", "studioLabGroup"] },
  { key: "cloud", label: "云端", groups: ["cloudCenterGroup"] },
];

/**
 * Marketplace 的折叠子导航——不再由侧边栏渲染（Marketplace 现在是
 * Cloud Center 里的一个普通模块条目），改为 MarketplaceCenter.jsx
 * 自己在页面内用 Tabs 渲染，这里只保留数据定义供该组件消费。
 *   - implemented：真实可用（读写 shared/marketplace/ 的 Cloud Mock 数据）
 *   - cloudMock：可用，但明确基于本地模拟的云端数据，不是真实后端
 *   - planned：尚未实现，占位说明
 */
export const MARKETPLACE_SUBNAV = [
  { key: "overview", label: "Marketplace 概览", status: "implemented" },
  { key: "myPackages", label: "我的能力包", status: "implemented" },
  { key: "review", label: "上架审核", status: "implemented" },
  { key: "releaseCandidate", label: "Release Candidate 提交", status: "planned" },
  { key: "versionsGray", label: "版本与灰度", status: "implemented" },
  { key: "pricingLicense", label: "定价与 License", status: "implemented" },
  { key: "salesDownloads", label: "销售与下载", status: "implemented" },
  { key: "developers", label: "开发者中心", status: "implemented" },
  { key: "settlement", label: "分成与结算", status: "planned" },
  { key: "cloudConsole", label: "Cloud Marketplace 控制台", status: "cloudMock" },
];

export const DEFAULT_MODULE_KEY =
  FOUNDER_MODULES.find((module) => module.isDefault)?.key ?? FOUNDER_MODULES[0].key;

/**
 * 给定当前激活的 Founder 模块 key，返回它应该自动展开的手风琴分组
 * key——Operator/Studio/Cloud 三个"外部 registry"分组的展开状态由
 * 激活的 module 本身决定（module==="operatorLab" 就展开
 * "operatorLabGroup"），不需要子项 key 逐一维护映射表。
 */
export function getGroupKeyForModule(moduleKey) {
  const moduleConfig = getModuleConfig(moduleKey);
  return moduleConfig?.group ?? null;
}

export function getModuleConfig(moduleKey) {
  return FOUNDER_MODULES.find((module) => module.key === moduleKey) ?? null;
}

/**
 * 已收口/已迁移的旧一级菜单 → 新落点的重定向表。旧的 `?module=xxx`
 * 收藏夹链接不会变成 404 或静默回退到默认页，而是带着正确的子页面
 * 落地。
 *
 * 注意：不是所有迁移都需要在这里登记——`modelRouter`/
 * `automationPolicy`/`tokenCenter`/`adCenter`/`benchmarkCenter`/
 * `replayCenter`/`evaluationCenter`/`systemCenter`/`marketplaceCenter`
 * 这些模块 key 本身没有变化，只是 `FOUNDER_MODULES` 里的 `group`
 * 字段（侧边栏挂载位置）变了——`getModuleConfig(key)` 仍然能找到
 * 它们，`?module=modelRouter` 这类旧链接不需要重定向表也能正常落地。
 * 这张表只登记**module key 本身被废弃**、需要映射到新 key+subView
 * 组合的情况。
 */
export const MODULE_REDIRECTS = {
  secretary: { module: "founderWorkbench", subView: "secretary" },
  dashboard: { module: "founderWorkbench", subView: "dashboard" },
  contentCenter: { module: "studioLab", subView: "workspace" },
  liveCenter: { module: "studioLab", subView: "aiLive" },
  trafficNetworkCenter: { module: "studioLab", subView: "matrixAccounts" },
  storeCenter: { module: "operatorLab", subView: "settings" },
  storeConnectionCenter: { module: "operatorLab", subView: "storeConnection" },
};

export function resolveModuleRedirect(moduleKey) {
  return MODULE_REDIRECTS[moduleKey] ?? null;
}
