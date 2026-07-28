import { CAPABILITY_KEYS } from "../capabilities.js";

/**
 * 模块的唯一权威列表：侧边栏、导航状态、页面渲染表都从这里读取，
 * 不在别处重复定义模块 key。
 *
 * 阶段 M8 Founder Product Shell Consolidation：Founder 不再平铺一套
 * 和 Operator/Studio 重复的经营业务菜单——一级导航正式收口为六组
 * （Founder 总览 / 产品研发中心 / Operator 实验室 / Studio 实验室 /
 * Marketplace 中心 / 系统与发布）。原来的"店铺经营"/"增长与资金"/
 * "分析与系统"分组被拆解：
 *   - 店铺（storeCenter）→ 已迁移进 Operator 实验室内嵌的
 *     ShopCenterContent（见 shared/products/operator/），Founder
 *     不再单独有一个"店铺中心"顶级入口。
 *   - 内容中心/AI直播中心/流量网络中心 → 通过 MODULE_REDIRECTS 重定
 *     向到 Studio 实验室对应页面（studio/ 已经是这些能力的真实、
 *     完整实现，不是占位页），旧收藏夹链接不会失效。
 *   - 商品中心/订单中心/客服中心/审批中心 → **已知的、明确记录的
 *     未完成收口项**：这几个模块目前只在 Founder 里有真实实现，
 *     独立 Operator 对应页面（operator-preview/ 的 products/orders/
 *     customerService/approvals）还是诚实的"即将上线"占位页，尚未
 *     完成和 Founder 版本的单一真源合并（该合并需要把这几个模块
 *     内部对 useConsoleNavContext/useToast 的直接依赖改造成 props
 *     接口，工作量与店铺模块的迁移相当，本轮未完成，见
 *     founder-superset-live-pilot.md）。在完成之前，它们保留在
 *     Founder 侧、分组到"Operator 实验室"旁边（而不是继续留在一个
 *     叫"店铺经营"的独立分组里，避免看起来像是刻意维持的第二套业务
 *     菜单），并带 `pendingOperatorParity: true` 标记——ConsoleSidebar
 *     据此渲染一个"待同步"提示，不让这个缺口在 UI 上被悄悄掩盖。
 *   - 广告中心（adCenter）→ 重新归类为 Founder 专属研发工具（对应
 *     operator-preview/pages/AdOpsPage.jsx 自己代码注释里早就说明的
 *     边界："不暴露 Founder 才有的无限制广告开发/策略配置工具"），
 *     移入"产品研发中心"，不再和 Operator 的"广告投放"顶级菜单并列，
 *     避免被误读成同一层级的重复入口。
 *
 * 阶段 M8c 三类秘书正式区分："AI 秘书处"是 **Founder 总秘书**——
 * 跨产品、跨实验室、跨研发与经营的总控入口：接收创始人自然语言指令、
 * 跨 Operator 和 Studio 调度、查询研发/第一家真实店铺/第一条内容
 * 项目状态、调用产品研发中心、汇总 Operator秘书和 Studio秘书的
 * 报告、生成跨产品日报周报和决策建议。它不等同于经营秘书
 * （operator-preview/ 的"Operator秘书"）也不等同于内容创作秘书
 * （studio/ 的"Studio秘书"）——关系是调用/汇总，不是三套同名秘书。
 * 见 docs/01-reference-architecture/edition-architecture.md §19。
 */
export const FOUNDER_MODULES = [
  {
    key: "secretary",
    label: "AI 秘书处",
    group: "overview",
    icon: "✦",
    requiredCapability: CAPABILITY_KEYS.SECRETARY_VIEW,
    isDefault: true,
  },
  {
    key: "dashboard",
    label: "今日经营",
    group: "overview",
    icon: "▦",
    requiredCapability: CAPABILITY_KEYS.DASHBOARD_VIEW,
  },
  {
    key: "agentStudio",
    label: "Agent 工作室",
    group: "productRnd",
    icon: "⚙",
    requiredCapability: CAPABILITY_KEYS.AGENT_STUDIO_VIEW,
  },
  {
    key: "modelRouter",
    label: "模型路由",
    group: "productRnd",
    icon: "⇆",
    requiredCapability: CAPABILITY_KEYS.MODEL_ROUTER_VIEW,
  },
  {
    key: "automationPolicy",
    label: "自动化策略",
    group: "productRnd",
    icon: "☲",
    requiredCapability: CAPABILITY_KEYS.AUTOMATION_POLICY_VIEW,
  },
  {
    key: "tokenCenter",
    label: "Token 中心",
    group: "productRnd",
    icon: "◉",
    requiredCapability: CAPABILITY_KEYS.TOKEN_CENTER_VIEW,
  },
  {
    key: "adCenter",
    label: "广告策略研发",
    group: "productRnd",
    icon: "■",
    requiredCapability: CAPABILITY_KEYS.AD_CENTER_VIEW,
    founderOnly: true,
  },
  {
    key: "benchmarkCenter",
    label: "基准测试中心",
    group: "productRnd",
    icon: "⚑",
    requiredCapability: CAPABILITY_KEYS.BENCHMARK_CENTER_VIEW,
  },
  {
    key: "replayCenter",
    label: "回放中心",
    group: "productRnd",
    icon: "↻",
    requiredCapability: CAPABILITY_KEYS.REPLAY_CENTER_VIEW,
  },
  {
    key: "evaluationCenter",
    label: "评估中心",
    group: "productRnd",
    icon: "★",
    requiredCapability: CAPABILITY_KEYS.EVALUATION_CENTER_VIEW,
  },
  {
    key: "operatorLab",
    label: "Operator 实验室",
    group: "operatorLabGroup",
    icon: "▣",
    requiredCapability: CAPABILITY_KEYS.OPERATOR_LAB_VIEW,
  },
  {
    key: "storeConnectionCenter",
    label: "真实店铺接入",
    group: "operatorLabGroup",
    icon: "⛓",
    requiredCapability: CAPABILITY_KEYS.STORE_CONNECTION_CENTER_VIEW,
  },
  {
    key: "productCenter",
    label: "商品中心",
    group: "operatorLabGroup",
    icon: "▤",
    requiredCapability: CAPABILITY_KEYS.PRODUCT_CENTER_VIEW,
    pendingOperatorParity: true,
  },
  {
    key: "orderCenter",
    label: "订单中心",
    group: "operatorLabGroup",
    icon: "▥",
    requiredCapability: CAPABILITY_KEYS.ORDER_CENTER_VIEW,
    pendingOperatorParity: true,
  },
  {
    key: "customerServiceCenter",
    label: "客服中心",
    group: "operatorLabGroup",
    icon: "⟲",
    requiredCapability: CAPABILITY_KEYS.CUSTOMER_SERVICE_CENTER_VIEW,
    pendingOperatorParity: true,
  },
  {
    key: "approvalCenter",
    label: "审批中心",
    group: "operatorLabGroup",
    icon: "☑",
    requiredCapability: CAPABILITY_KEYS.APPROVAL_CENTER_VIEW,
    pendingOperatorParity: true,
  },
  {
    key: "studioLab",
    label: "Studio 实验室",
    group: "studioLabGroup",
    icon: "◆",
    requiredCapability: CAPABILITY_KEYS.STUDIO_LAB_VIEW,
  },
  {
    key: "marketplaceCenter",
    label: "Marketplace 中心",
    group: "marketplace",
    icon: "⛁",
    requiredCapability: CAPABILITY_KEYS.MARKETPLACE_CENTER_VIEW,
  },
  {
    key: "systemCenter",
    label: "系统中心",
    group: "system",
    icon: "⚙⚙",
    requiredCapability: CAPABILITY_KEYS.SYSTEM_CENTER_VIEW,
  },
];

/**
 * 阶段 M8c Founder Unified Product Navigation：`collapsible: true` 的
 * 分组在 ConsoleSidebar 里渲染成手风琴（单一展开）——`external` 标记
 * 该分组的子项来自哪个共享 registry（而不是 FOUNDER_MODULES 自己），
 * 由 ConsoleSidebar 直接 import 对应产品的 NAV_ITEMS 渲染，不手写
 * 第二份导航数组。"Founder 总览"不折叠（默认页所在分组，需要一直
 * 可见）。
 */
export const NAV_GROUPS = [
  { key: "overview", label: "Founder 总览", collapsible: false },
  { key: "productRnd", label: "产品研发中心", collapsible: true },
  { key: "operatorLabGroup", label: "Operator 实验室", collapsible: true, external: "operator" },
  { key: "studioLabGroup", label: "Studio 实验室", collapsible: true, external: "studio" },
  { key: "marketplace", label: "Marketplace 中心", collapsible: true, external: "marketplaceCloud" },
  { key: "system", label: "系统与发布", collapsible: true },
];

/**
 * Marketplace 中心的折叠子导航（阶段 M8c §5/§6）——云端 Marketplace
 * 的 Founder 管理入口，不是本地完整市场服务。`status` 标注真实完成
 * 度，ConsoleSidebar/MarketplaceCenter 据此渲染"规划中"/"Cloud Mock"
 * 徽章，不允许把未完成的项呈现成已上线。
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
 * key——Operator/Studio/Marketplace 三个"外部 registry"分组的展开
 * 状态由激活的 module 本身决定（module==="operatorLab" 就展开
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
 * 已收口的旧一级菜单 → 新落点的重定向表。内容/直播/流量网络三个
 * 模块的真实实现现在只活在 Studio（studio/），Founder 不再自己维护
 * 一份；旧的 `?module=xxx` 收藏夹链接不会变成 404 或静默回退到默认
 * 页，而是带着正确的 Studio 实验室子页面落地。
 */
export const MODULE_REDIRECTS = {
  contentCenter: { module: "studioLab", subView: "contentProjects" },
  liveCenter: { module: "studioLab", subView: "aiLive" },
  trafficNetworkCenter: { module: "studioLab", subView: "matrixAccounts" },
  storeCenter: { module: "operatorLab", subView: "shops" },
};

export function resolveModuleRedirect(moduleKey) {
  return MODULE_REDIRECTS[moduleKey] ?? null;
}
