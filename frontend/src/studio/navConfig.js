/**
 * AI Commerce OS Studio 一级导航的唯一权威列表（阶段：Studio V3
 * Integration — AI Content Company Operating System）。
 *
 * Studio 的产品定位从"内容生产工具"升级为"内容公司操作系统"：覆盖
 * 热点发现→趋势预测→AI选题→内容立项→剧本→脚本→分镜→角色→场景→
 * 图片/视频生成→AI剪辑→配音/字幕/BGM→内容审核→矩阵发布→账号运营→
 * 流量池经营→广告运营→平台分成→品牌合作→带货与直播→知识产品→
 * 版权/IP授权→项目损益与ROI→Agent持续优化的完整业务闭环，AI图文与
 * AI短剧/AI视频/AI直播并列为一级内容形态，而不是"生成一张图"的
 * 附属功能。
 *
 * 每个 NAV_ITEM 携带 `group` 字段，对应 NAV_GROUPS 里的分组——独立
 * Studio（StudioApp.jsx）和 Founder Studio 实验室（ConsoleSidebar.jsx
 * 展开 studioLabGroup 时）共用同一份分组结构渲染手风琴，不是两套
 * 导航数据。`hidden: true` 的条目是详情/工作台页面（AI导演工作台、
 * AI图文编辑器），不出现在侧边栏，但通过 navigate(key, params) 从
 * 内容项目列表/秘书快捷操作/热点"创建项目"等入口进入，`
 * isValidStudioNavKey` 仍然认它是合法页面 key。
 */
export const NAV_ITEMS = [
  // ---- 总控 ----
  { key: "secretary", label: "Studio秘书", icon: "☑", group: "control" },
  { key: "overview", label: "Studio概览", icon: "◆", group: "control" },

  // ---- 内容策划 ----
  { key: "hotspotAnalysis", label: "热点分析", icon: "🔥", group: "planning" },
  { key: "trendForecast", label: "趋势预测", icon: "↗", group: "planning" },
  { key: "topicPool", label: "选题池", icon: "◎", group: "planning" },
  { key: "contentProjects", label: "内容项目", icon: "▣", group: "planning" },

  // ---- AI创作中心 ----
  { key: "shortDrama", label: "AI短剧", icon: "◈", group: "creation" },
  { key: "aiVideo", label: "AI视频", icon: "▶", group: "creation" },
  { key: "graphicContent", label: "AI图文", icon: "▧", group: "creation" },
  { key: "aiLive", label: "AI直播", icon: "◉", group: "creation" },
  { key: "scriptStoryboard", label: "剧本 / 脚本 / 分镜", icon: "✎", group: "creation" },
  { key: "characterScene", label: "角色与场景", icon: "♙", group: "creation" },
  { key: "mediaGeneration", label: "图片 / 视频生成", icon: "▤", group: "creation" },
  { key: "aiEditing", label: "AI剪辑", icon: "⌁", group: "creation" },
  { key: "voiceSubtitleBgm", label: "配音 / 字幕 / BGM", icon: "♪", group: "creation" },
  { key: "contentReview", label: "内容审核", icon: "✓", group: "creation" },

  // ---- 矩阵运营 ----
  { key: "matrixAccounts", label: "矩阵账号", icon: "▦", group: "matrix" },
  { key: "matrixPublish", label: "矩阵发布", icon: "⬆", group: "matrix" },
  { key: "contentAssets", label: "内容资产", icon: "◫", group: "matrix" },
  { key: "trafficPool", label: "流量池", icon: "◈", group: "matrix" },
  { key: "adResources", label: "广告资源", icon: "◇", group: "matrix" },
  { key: "adOrders", label: "广告订单", icon: "▩", group: "matrix" },

  // ---- 商业经营 ----
  { key: "monetizationCenter", label: "商业变现", icon: "¥", group: "commerce" },
  { key: "revenueShare", label: "平台分成", icon: "▥", group: "commerce" },
  { key: "brandDeals", label: "品牌合作", icon: "◌", group: "commerce" },
  { key: "liveCommerce", label: "带货与直播", icon: "🛒", group: "commerce" },
  { key: "knowledgeProducts", label: "知识产品", icon: "🎓", group: "commerce" },
  { key: "ipLicensing", label: "版权 / IP授权", icon: "©", group: "commerce" },
  { key: "computeTasks", label: "算力任务", icon: "⟲", group: "commerce" },
  { key: "dataAnalytics", label: "数据分析", icon: "◔", group: "commerce" },
  { key: "marketplace", label: "能力市场", icon: "⛁", group: "commerce" },

  // ---- 设置 ----
  { key: "studioSettings", label: "Studio设置", icon: "⚙", group: "settings" },
  { key: "platformConnections", label: "平台连接", icon: "⛓", group: "settings" },
  { key: "brandGuidelines", label: "品牌规范", icon: "◐", group: "settings" },
  { key: "notificationsPermissions", label: "通知与权限", icon: "🔔", group: "settings" },

  // ---- 详情/工作台页面（不进侧边栏，通过项目行/快捷操作进入）----
  { key: "director", label: "AI导演工作台", icon: "🎬", group: "creation", hidden: true },
  { key: "graphicContentEditor", label: "AI图文编辑器", icon: "▧", group: "creation", hidden: true },
];

/**
 * 分组的展示顺序与标题。`collapsible: false` 的分组（总控）不参与
 * 手风琴折叠，始终展开——它是默认落地页所在分组。其余分组默认折叠，
 * 当前激活页面所在分组会强制展开（见 StudioApp.jsx /
 * ConsoleSidebar.jsx 的展开状态调整逻辑，两处使用同一套模式）。
 */
export const NAV_GROUPS = [
  { key: "control", label: "总控", collapsible: false },
  { key: "planning", label: "内容策划", collapsible: true },
  { key: "creation", label: "AI创作中心", collapsible: true },
  { key: "matrix", label: "矩阵运营", collapsible: true },
  { key: "commerce", label: "商业经营", collapsible: true },
  { key: "settings", label: "设置", collapsible: true },
];

export const DEFAULT_NAV_KEY = "overview";

export function isValidStudioNavKey(key) {
  return NAV_ITEMS.some((item) => item.key === key);
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
