/**
 * AI Commerce OS Studio 一级导航的唯一权威列表.
 *
 * Founder Master Edition V1.0 Charter §3.4 收口：13 个扁平子项——
 * Workspace / AI Image / AI Video / AI Article / AI Live / AI Short
 * Drama / AI Audio / Matrix Accounts / Publishing Center / Asset
 * Library / Brand Assets / Analytics / Settings。每个内容类型
 * （Image/Video/Article/Live/Short Drama/Audio）拥有自己完整的端到端
 * 生产流水线（Tab 形式），Workspace 只负责项目总览/生产队列/选题输入，
 * 不再拥有共享生产流水线——旧的 6 组 36 项分类（总控/内容策划/AI创作
 * 中心/矩阵运营/商业经营/设置）全部吸收进这 13 项里的组合页面
 * （见 pages/index.jsx 的 PAGE_COMPONENTS 顶部注释，逐项映射表）。
 *
 * 独立 Studio（StudioApp.jsx）和 Founder Studio Lab
 * （ConsoleSidebar.jsx 展开 studioLabGroup 时）共用同一份列表渲染
 * 手风琴，不是两套导航数据。`hidden: true` 的条目是详情/工作台页面
 * （AI导演工作台、AI图文编辑器），不出现在侧边栏，通过各 Workbench
 * 内部的本地状态或旧深链进入。
 */
export const NAV_ITEMS = [
  { key: "workspace", label: "Studio 工作台", icon: "◆", group: "studio" },
  { key: "graphicContent", label: "AI 图片", icon: "▧", group: "studio" },
  { key: "aiVideo", label: "AI 视频", icon: "▶", group: "studio" },
  { key: "aiArticle", label: "AI 文章", icon: "▤", group: "studio" },
  { key: "aiLive", label: "AI 直播", icon: "◉", group: "studio" },
  { key: "shortDrama", label: "AI 短剧", icon: "◈", group: "studio" },
  { key: "aiAudio", label: "AI 音频", icon: "♪", group: "studio" },
  { key: "matrixAccounts", label: "矩阵账号", icon: "▦", group: "studio" },
  { key: "publishingCenter", label: "发布中心", icon: "⬆", group: "studio" },
  { key: "assetLibrary", label: "素材库", icon: "◫", group: "studio" },
  { key: "brandAssets", label: "品牌资产", icon: "◐", group: "studio" },
  { key: "analytics", label: "内容数据", icon: "◔", group: "studio" },
  { key: "settings", label: "Studio 设置", icon: "⚙", group: "studio" },

  // ---- 详情/工作台页面（不进侧边栏）----
  { key: "director", label: "AI导演工作台", icon: "🎬", group: "studio", hidden: true },
  { key: "graphicContentEditor", label: "AI图文编辑器", icon: "▧", group: "studio", hidden: true },
];

/** 单一扁平分组——与 Operator Lab/Cloud Center 一致的呈现方式。 */
export const NAV_GROUPS = [{ key: "studio", label: "Studio", collapsible: false }];

export const DEFAULT_NAV_KEY = "workspace";

/**
 * 被 13 项收口吸收、不再是顶级子项的旧 key——仍然必须能通过
 * `isValidStudioNavKey` 解析（StudioLabConnected.jsx / StudioLab.jsx
 * 都用它是否为 true 来决定渲染 PAGE_COMPONENTS[key] 还是回退到默认
 * 页面），否则旧的 `?module=studioLab&subView=secretary` 这类深链会
 * 静默回退到 Workspace，而不是落地到 pages/index.jsx 里为它们保留的
 * 组合页面/原始页面——那就是本次 Charter 明确禁止的"静默丢弃能力"。
 */
export const LEGACY_STUDIO_KEYS = [
  "secretary", "overview", "hotspotAnalysis", "trendForecast", "topicPool", "contentProjects",
  "scriptStoryboard", "characterScene", "mediaGeneration", "aiEditing", "voiceSubtitleBgm", "contentReview",
  "matrixPublish", "contentAssets", "trafficPool", "adResources", "adOrders",
  "monetizationCenter", "revenueShare", "brandDeals", "liveCommerce", "knowledgeProducts", "ipLicensing",
  "computeTasks", "dataAnalytics", "marketplace",
  "studioSettings", "platformConnections", "brandGuidelines", "notificationsPermissions",
];

export function isValidStudioNavKey(key) {
  return NAV_ITEMS.some((item) => item.key === key) || LEGACY_STUDIO_KEYS.includes(key);
}

export function getStudioNavItemByKey(key) {
  return NAV_ITEMS.find((item) => item.key === key) ?? null;
}

/** 侧边栏可见的（非 hidden）导航项，按分组归类，用于手风琴渲染。 */
export function getVisibleNavItemsByGroup(groupKey) {
  return NAV_ITEMS.filter((item) => item.group === groupKey && !item.hidden);
}

export function getGroupKeyForNavItem(navKey) {
  return getStudioNavItemByKey(navKey)?.group ?? null;
}
