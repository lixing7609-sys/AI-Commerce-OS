/**
 * AI Commerce OS Studio 一级导航的唯一权威列表（阶段：四端产品体系
 * V1）。与 Cloud 的 navConfig.js、Founder 的 console/nav/
 * navConfig.js、Operator 的 helpers/navigation.js 同一个原则：拆到
 * 独立文件，方便 StudioApp.jsx 同时导出组件和这份纯数据而不触发
 * React Fast Refresh 的 lint 规则，也方便被测试单独 import。
 *
 * 13 项导航对应 §5 要求的核心页面——内容生产（内容项目/AI短剧/
 * AI视频/AI直播）、矩阵与资产（矩阵账号/内容资产）、流量与广告
 * （流量池/广告资源/广告订单）、平台协同（算力任务）、经营视图
 * （Studio概览/数据分析）、设置。全部是真实可点击页面，不是占位。
 */
export const NAV_ITEMS = [
  { key: "overview", label: "Studio 概览", icon: "◆" },
  { key: "contentProjects", label: "内容项目", icon: "▤" },
  { key: "shortDrama", label: "AI 短剧", icon: "▶" },
  { key: "aiVideo", label: "AI 视频", icon: "▥" },
  { key: "aiLive", label: "AI 直播", icon: "◉" },
  { key: "matrixAccounts", label: "矩阵账号", icon: "▦" },
  { key: "contentAssets", label: "内容资产", icon: "▧" },
  { key: "trafficPool", label: "流量池", icon: "◈" },
  { key: "adResources", label: "广告资源", icon: "◇" },
  { key: "adOrders", label: "广告订单", icon: "▩" },
  { key: "computeTasks", label: "算力任务", icon: "⟲" },
  { key: "dataAnalytics", label: "数据分析", icon: "◔" },
  { key: "settings", label: "设置", icon: "⚙" },
];

export const DEFAULT_NAV_KEY = "overview";

export function isValidStudioNavKey(key) {
  return NAV_ITEMS.some((item) => item.key === key);
}

export function getStudioNavItemByKey(key) {
  return NAV_ITEMS.find((item) => item.key === key) ?? null;
}
