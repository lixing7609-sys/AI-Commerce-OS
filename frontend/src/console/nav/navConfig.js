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
    key: "systemCenter",
    label: "系统中心",
    group: "system",
    icon: "⚙⚙",
    requiredCapability: CAPABILITY_KEYS.SYSTEM_CENTER_VIEW,
  },
];

export const NAV_GROUPS = [
  { key: "overview", label: "Founder 总览" },
  { key: "productRnd", label: "产品研发中心" },
  { key: "operatorLabGroup", label: "Operator 实验室" },
  { key: "studioLabGroup", label: "Studio 实验室" },
  { key: "marketplace", label: "Marketplace 中心" },
  { key: "system", label: "系统与发布" },
];

export const DEFAULT_MODULE_KEY =
  FOUNDER_MODULES.find((module) => module.isDefault)?.key ?? FOUNDER_MODULES[0].key;

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
