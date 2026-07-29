import { CAPABILITY_KEYS } from "../capabilities.js";

/**
 * 模块的唯一权威列表：侧边栏、导航状态、页面渲染表都从这里读取，
 * 不在别处重复定义模块 key。
 *
 * 阶段 Founder Full-System v3（Batch 2 IA 重建）：一级导航正式收口为
 * 交办任务冻结的十一组——Founder工作台 / Agent中心 / Prompt中心 /
 * Skill中心 / Workflow中心 / Knowledge中心 / Connector中心 /
 * Capability中心 / Operator 实验室 / Studio 实验室 / Cloud Center。
 * 旧的"产品研发中心 / Marketplace 中心 / 系统与发布"三个顶级分组被
 * 拆解迁移，不是删除功能：
 *   - Agent 工作室/模型路由 → Agent 中心
 *   - 自动化策略/回放中心 → Workflow 中心
 *   - 基准测试中心/评估中心/广告策略研发 → Capability 中心
 *   - Token 中心/Marketplace 中心/系统中心 → Cloud Center（Founder
 *     专属尾部条目，见 externalPosition="after"）
 *   - Operator Cloud（原裸 URL 默认应用）→ Cloud Center 的外部
 *     registry（`external: "cloud"`），见 cloud/pageRegistry.jsx
 *   - 商品中心/订单中心/客服中心/审批中心/真实店铺接入 → 不再是
 *     FOUNDER_MODULES 里独立的、渲染成侧边栏按钮的模块（这正是
 *     "该模块尚未和 Operator 实验室完成单一真源合并"四个重复警告
 *     按钮的来源）——现在直接作为 Operator 实验室 v2 registry
 *     （`console/labs/operatorLabV2/`）自己的子项存在，和"店铺/广告
 *     投放"等其它 Operator 子项同一层级，不再有第二套导航。组件本身
 *     （ProductCenterModule/OrderCenterModule/…）没有删除，仍在
 *     `console/modules/` 下，只是渲染入口改为 Operator 实验室 v2
 *     registry 直接 import，不再经过顶层 FOUNDER_MODULES。
 *   - Prompt中心/Skill中心/Knowledge中心/Connector中心 → 全新的
 *     Founder 核心资产中心，使用 `console/shared/assetDomain.js` +
 *     `console/kit/AssetCenterModule.jsx` 的通用列表/详情/新建/编辑
 *     骨架，不是文字占位页。
 *
 * "AI 秘书处"和"今日经营"合并为一个顶级入口"Founder工作台"
 * （`founderWorkbench`，内部用 subView 区分两个 Tab），不再是两个
 * 平级按钮——交办任务的目标信息架构里"Founder工作台"是唯一一条叶子
 * 节点。旧的 `?module=secretary` / `?module=dashboard` 链接通过
 * `MODULE_REDIRECTS` 落地到对应 Tab，不会 404。
 */
export const FOUNDER_MODULES = [
  {
    // Design DNA v1.0 internal showcase (docs/01-foundation/design/).
    // Not a customer nav item — reachable only via ?module=designDna,
    // same hiddenFromSidebar pattern already used for productCenter/
    // orderCenter/etc above.
    key: "designDna",
    label: "Design DNA Showcase",
    group: "founderWorkbenchGroup",
    icon: "◆",
    requiredCapability: CAPABILITY_KEYS.DESIGN_DNA_VIEW,
    hiddenFromSidebar: true,
  },
  {
    key: "founderWorkbench",
    label: "Founder工作台",
    group: "founderWorkbenchGroup",
    icon: "✦",
    requiredCapability: CAPABILITY_KEYS.FOUNDER_WORKBENCH_VIEW,
    isDefault: true,
  },
  {
    key: "agentStudio",
    label: "Agent 工作室",
    group: "agentCenterGroup",
    icon: "⚙",
    requiredCapability: CAPABILITY_KEYS.AGENT_STUDIO_VIEW,
  },
  {
    key: "modelRouter",
    label: "模型路由",
    group: "agentCenterGroup",
    icon: "⇆",
    requiredCapability: CAPABILITY_KEYS.MODEL_ROUTER_VIEW,
  },
  {
    key: "promptCenter",
    label: "Prompt 列表",
    group: "promptCenterGroup",
    icon: "✎",
    requiredCapability: CAPABILITY_KEYS.PROMPT_CENTER_VIEW,
  },
  {
    key: "skillCenter",
    label: "Skill 列表",
    group: "skillCenterGroup",
    icon: "🧩",
    requiredCapability: CAPABILITY_KEYS.SKILL_CENTER_VIEW,
  },
  {
    key: "automationPolicy",
    label: "自动化策略",
    group: "workflowCenterGroup",
    icon: "☲",
    requiredCapability: CAPABILITY_KEYS.AUTOMATION_POLICY_VIEW,
  },
  {
    key: "replayCenter",
    label: "回放中心",
    group: "workflowCenterGroup",
    icon: "↻",
    requiredCapability: CAPABILITY_KEYS.REPLAY_CENTER_VIEW,
  },
  {
    key: "knowledgeCenter",
    label: "知识库",
    group: "knowledgeCenterGroup",
    icon: "▤",
    requiredCapability: CAPABILITY_KEYS.KNOWLEDGE_CENTER_VIEW,
  },
  {
    key: "connectorCenter",
    label: "连接器",
    group: "connectorCenterGroup",
    icon: "⛓",
    requiredCapability: CAPABILITY_KEYS.CONNECTOR_CENTER_VIEW,
  },
  {
    key: "benchmarkCenter",
    label: "基准测试中心",
    group: "capabilityCenterGroup",
    icon: "⚑",
    requiredCapability: CAPABILITY_KEYS.BENCHMARK_CENTER_VIEW,
  },
  {
    key: "evaluationCenter",
    label: "评估中心",
    group: "capabilityCenterGroup",
    icon: "★",
    requiredCapability: CAPABILITY_KEYS.EVALUATION_CENTER_VIEW,
  },
  {
    key: "adCenter",
    label: "广告策略研发",
    group: "capabilityCenterGroup",
    icon: "■",
    requiredCapability: CAPABILITY_KEYS.AD_CENTER_VIEW,
    founderOnly: true,
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
  // Studio 实验控制层——未改动，见 studioLabGroup 的 externalPosition="after"。
  {
    key: "studioAgents", label: "Studio Agent", group: "studioLabGroup", icon: "⚙",
    requiredCapability: CAPABILITY_KEYS.STUDIO_LAB_EXPERIMENT_VIEW, founderOnly: true,
  },
  {
    key: "studioPrompts", label: "Studio Prompt", group: "studioLabGroup", icon: "✎",
    requiredCapability: CAPABILITY_KEYS.STUDIO_LAB_EXPERIMENT_VIEW, founderOnly: true,
  },
  {
    key: "studioSkills", label: "Studio Skill", group: "studioLabGroup", icon: "🧩",
    requiredCapability: CAPABILITY_KEYS.STUDIO_LAB_EXPERIMENT_VIEW, founderOnly: true,
  },
  {
    key: "studioWorkflows", label: "Studio Workflow", group: "studioLabGroup", icon: "⇄",
    requiredCapability: CAPABILITY_KEYS.STUDIO_LAB_EXPERIMENT_VIEW, founderOnly: true,
  },
  {
    key: "studioModelRouting", label: "Studio 模型路由", group: "studioLabGroup", icon: "⇆",
    requiredCapability: CAPABILITY_KEYS.STUDIO_LAB_EXPERIMENT_VIEW, founderOnly: true,
  },
  {
    key: "studioPromptTest", label: "Prompt测试台", group: "studioLabGroup", icon: "⚑",
    requiredCapability: CAPABILITY_KEYS.STUDIO_LAB_EXPERIMENT_VIEW, founderOnly: true,
  },
  {
    key: "studioReplay", label: "真实任务回放", group: "studioLabGroup", icon: "↻",
    requiredCapability: CAPABILITY_KEYS.STUDIO_LAB_EXPERIMENT_VIEW, founderOnly: true,
  },
  {
    key: "studioEvaluation", label: "A/B评测", group: "studioLabGroup", icon: "★",
    requiredCapability: CAPABILITY_KEYS.STUDIO_LAB_EXPERIMENT_VIEW, founderOnly: true,
  },
  {
    key: "studioLogs", label: "运行日志", group: "studioLabGroup", icon: "▤",
    requiredCapability: CAPABILITY_KEYS.STUDIO_LAB_EXPERIMENT_VIEW, founderOnly: true,
  },
  {
    key: "studioCosts", label: "成本分析", group: "studioLabGroup", icon: "◉",
    requiredCapability: CAPABILITY_KEYS.STUDIO_LAB_EXPERIMENT_VIEW, founderOnly: true,
  },
  {
    key: "studioReleases", label: "版本与发布", group: "studioLabGroup", icon: "⛁",
    requiredCapability: CAPABILITY_KEYS.STUDIO_LAB_EXPERIMENT_VIEW, founderOnly: true,
  },
  {
    key: "cloudCenter",
    label: "Cloud Center",
    group: "cloudCenterGroup",
    icon: "☁",
    requiredCapability: CAPABILITY_KEYS.CLOUD_CENTER_VIEW,
  },
  // Cloud Center 的 Founder 专属尾部条目——原来的顶级"Token 中心"/
  // "Marketplace 中心"/"系统中心"，按交办任务 Phase 4 映射表迁移到
  // 这里，组件本身未改动，只是侧边栏挂载位置变化。
  {
    key: "tokenCenter",
    label: "Token 中心",
    group: "cloudCenterGroup",
    icon: "◉",
    requiredCapability: CAPABILITY_KEYS.TOKEN_CENTER_VIEW,
  },
  {
    key: "marketplaceCenter",
    label: "Marketplace",
    group: "cloudCenterGroup",
    icon: "⛁",
    requiredCapability: CAPABILITY_KEYS.MARKETPLACE_CENTER_VIEW,
  },
  {
    key: "systemCenter",
    label: "系统中心",
    group: "cloudCenterGroup",
    icon: "⚙⚙",
    requiredCapability: CAPABILITY_KEYS.SYSTEM_CENTER_VIEW,
  },
];

/**
 * `collapsible: true` 的分组渲染成手风琴（单一展开）——`external`
 * 标记该分组的子项来自哪个共享 registry，由 ConsoleSidebar 直接
 * import 对应产品的 NAV_ITEMS 渲染，不手写第二份导航数组。
 * "Founder工作台"不折叠（默认页所在分组，需要一直可见）。
 */
export const NAV_GROUPS = [
  { key: "founderWorkbenchGroup", label: "Founder工作台", collapsible: false },
  { key: "agentCenterGroup", label: "Agent中心", collapsible: true },
  { key: "promptCenterGroup", label: "Prompt中心", collapsible: true },
  { key: "skillCenterGroup", label: "Skill中心", collapsible: true },
  { key: "workflowCenterGroup", label: "Workflow中心", collapsible: true },
  { key: "knowledgeCenterGroup", label: "Knowledge中心", collapsible: true },
  { key: "connectorCenterGroup", label: "Connector中心", collapsible: true },
  { key: "capabilityCenterGroup", label: "Capability中心", collapsible: true },
  // Operator 实验室 v2：唯一权威列表在 labs/operatorLabV2/navigation.js，
  // 已经包含"店铺/商品/内容/广告投放/订单/客户/客服/审批/…"全部子
  // 项，不再需要 FOUNDER_MODULES 里任何 operatorLabGroup 的 items
  // （旧版本"真实店铺接入/商品中心/订单中心/客服中心/审批中心"五个
  // FOUNDER_MODULES 条目就是四个重复警告按钮的来源，本次直接移除，
  // 不是隐藏）。
  { key: "operatorLabGroup", label: "Operator 实验室", collapsible: true, external: "operatorV2", externalPosition: "before" },
  { key: "studioLabGroup", label: "Studio 实验室", collapsible: true, external: "studio", externalPosition: "after" },
  // Cloud Center：Operator Cloud 自己的 7 项导航（`external: "cloud"`）
  // 在前，Founder 专属迁入项（Token 中心/Marketplace/系统中心）在后。
  { key: "cloudCenterGroup", label: "Cloud Center", collapsible: true, external: "cloud", externalPosition: "before" },
];

/**
 * Design DNA v1.1 navigation shell (docs/01-foundation/design/
 * navigation-shell-spec.md) — purely presentational grouping layer on
 * top of NAV_GROUPS, added for the sidebar's three visual zones
 * (Core/Labs/Cloud). Does NOT change FOUNDER_MODULES, NAV_GROUPS, or
 * MODULE_REDIRECTS — every existing group key/module key/persisted
 * localStorage value keeps meaning exactly what it meant before.
 * Core zone groups render flat/always-visible (no accordion — see
 * ConsoleSidebar.jsx); Labs/Cloud keep the existing single-expanded
 * accordion behavior, now scoped to just those 3 groups.
 */
export const NAV_ZONES = [
  {
    key: "core",
    label: "Core",
    groups: [
      "founderWorkbenchGroup", "agentCenterGroup", "promptCenterGroup", "skillCenterGroup",
      "workflowCenterGroup", "knowledgeCenterGroup", "connectorCenterGroup", "capabilityCenterGroup",
    ],
  },
  { key: "labs", label: "Labs", groups: ["operatorLabGroup", "studioLabGroup"] },
  { key: "cloud", label: "Cloud", groups: ["cloudCenterGroup"] },
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
  contentCenter: { module: "studioLab", subView: "contentProjects" },
  liveCenter: { module: "studioLab", subView: "aiLive" },
  trafficNetworkCenter: { module: "studioLab", subView: "matrixAccounts" },
  storeCenter: { module: "operatorLab", subView: "shops" },
  storeConnectionCenter: { module: "operatorLab", subView: "storeConnection" },
};

export function resolveModuleRedirect(moduleKey) {
  return MODULE_REDIRECTS[moduleKey] ?? null;
}
