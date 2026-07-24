import { CAPABILITY_KEYS } from "../capabilities.js";

/**
 * 模块的唯一权威列表：侧边栏、导航状态、页面渲染表都从这里读取，
 * 不在别处重复定义模块 key。
 *
 * 阶段 Founder UX Review V4：导航按业务分组重排——经营总览 / 店铺
 * 经营 / 增长与资金 / AI 与自动化 / 分析与系统，体现"机会发现 →
 * 内容运营 → 直播运营 → 流量与广告 → 订单 → 售后 → 知识反馈 →
 * Agent 优化"的完整经营闭环，而不是一份不分组的模块清单。
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
    key: "storeCenter",
    label: "店铺中心",
    group: "storeOps",
    icon: "⌂",
    requiredCapability: CAPABILITY_KEYS.STORE_CENTER_VIEW,
  },
  {
    key: "productCenter",
    label: "商品中心",
    group: "storeOps",
    icon: "▣",
    requiredCapability: CAPABILITY_KEYS.PRODUCT_CENTER_VIEW,
  },
  {
    key: "contentCenter",
    label: "内容中心",
    group: "storeOps",
    icon: "▥",
    requiredCapability: CAPABILITY_KEYS.CONTENT_CENTER_VIEW,
  },
  {
    key: "liveCenter",
    label: "AI直播中心",
    group: "storeOps",
    icon: "▶",
    requiredCapability: CAPABILITY_KEYS.LIVE_CENTER_VIEW,
  },
  {
    key: "orderCenter",
    label: "订单中心",
    group: "storeOps",
    icon: "▤",
    requiredCapability: CAPABILITY_KEYS.ORDER_CENTER_VIEW,
  },
  {
    key: "customerServiceCenter",
    label: "客服中心",
    group: "storeOps",
    icon: "⟲",
    requiredCapability: CAPABILITY_KEYS.CUSTOMER_SERVICE_CENTER_VIEW,
  },
  {
    key: "trafficNetworkCenter",
    label: "流量网络中心",
    group: "growth",
    icon: "◆",
    requiredCapability: CAPABILITY_KEYS.TRAFFIC_NETWORK_CENTER_VIEW,
  },
  {
    key: "adCenter",
    label: "广告中心",
    group: "growth",
    icon: "■",
    requiredCapability: CAPABILITY_KEYS.AD_CENTER_VIEW,
  },
  {
    key: "tokenCenter",
    label: "Token 中心",
    group: "growth",
    icon: "◉",
    requiredCapability: CAPABILITY_KEYS.TOKEN_CENTER_VIEW,
  },
  {
    key: "agentStudio",
    label: "Agent 工作室",
    group: "aiAutomation",
    icon: "⚙",
    requiredCapability: CAPABILITY_KEYS.AGENT_STUDIO_VIEW,
  },
  {
    key: "modelRouter",
    label: "模型路由",
    group: "aiAutomation",
    icon: "⇆",
    requiredCapability: CAPABILITY_KEYS.MODEL_ROUTER_VIEW,
  },
  {
    key: "automationPolicy",
    label: "自动化策略",
    group: "aiAutomation",
    icon: "☲",
    requiredCapability: CAPABILITY_KEYS.AUTOMATION_POLICY_VIEW,
  },
  {
    key: "approvalCenter",
    label: "审批中心",
    group: "aiAutomation",
    icon: "☑",
    requiredCapability: CAPABILITY_KEYS.APPROVAL_CENTER_VIEW,
  },
  {
    key: "benchmarkCenter",
    label: "基准测试中心",
    group: "analysisSystem",
    icon: "⚑",
    requiredCapability: CAPABILITY_KEYS.BENCHMARK_CENTER_VIEW,
  },
  {
    key: "replayCenter",
    label: "回放中心",
    group: "analysisSystem",
    icon: "↻",
    requiredCapability: CAPABILITY_KEYS.REPLAY_CENTER_VIEW,
  },
  {
    key: "evaluationCenter",
    label: "评估中心",
    group: "analysisSystem",
    icon: "★",
    requiredCapability: CAPABILITY_KEYS.EVALUATION_CENTER_VIEW,
  },
  {
    key: "systemCenter",
    label: "系统中心",
    group: "analysisSystem",
    icon: "⚙⚙",
    requiredCapability: CAPABILITY_KEYS.SYSTEM_CENTER_VIEW,
  },
];

export const NAV_GROUPS = [
  { key: "overview", label: "经营总览" },
  { key: "storeOps", label: "店铺经营" },
  { key: "growth", label: "增长与资金" },
  { key: "aiAutomation", label: "AI 与自动化" },
  { key: "analysisSystem", label: "分析与系统" },
];

export const DEFAULT_MODULE_KEY =
  FOUNDER_MODULES.find((module) => module.isDefault)?.key ?? FOUNDER_MODULES[0].key;

export function getModuleConfig(moduleKey) {
  return FOUNDER_MODULES.find((module) => module.key === moduleKey) ?? null;
}
