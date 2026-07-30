/**
 * Operator Cloud 一级导航的唯一权威列表。与 Founder 的
 * console/nav/navConfig.js、Operator 的 helpers/navigation.js 同一个
 * 原则：拆到独立文件，既是为了让 CloudConsoleApp.jsx 能同时导出组件
 * 和这份纯数据而不触发 React Fast Refresh 的 lint 规则，也是为了能被
 * 测试单独 import。
 *
 * Founder Master Edition Charter §3.5 收口后，Cloud Center 在 Founder
 * 里呈现 10 个子项（Devices/OTA/License/Token/Marketplace/Version/
 * Assets/Nodes/Monitoring/Logs）。这四个（Devices/OTA/License/Nodes）
 * 是设备群自身的原生导航，由这份共享 registry 提供，独立 `/cloud`
 * 应用和 Founder Cloud Center 都直接消费，不分叉。其余六个
 * （Token/Marketplace/Version/Assets/Monitoring/Logs）是 Founder 侧的
 * 组合视图（见 console/nav/navConfig.js 的 cloudCenterGroup 尾部
 * 条目），因为它们复用了依赖 Founder ConsoleNavContext 的既有组件
 * （TokenCenterModule/MarketplaceCenter），还不能安全地下沉到这个不
 * 依赖 Founder 上下文的共享包——这是本轮明确记录的已知差距，不是遗漏。
 *
 * "经营者"折叠进 Devices 的 Tab（DevicesWorkbenchPage，cloudPages.jsx），
 * "总览"和"Token 计量"在 Founder 侧分别折叠进 Monitoring 与 Token——
 * 三者的组件/key 都还在 PAGE_COMPONENTS 里可解析，只是不再出现在这份
 * 可见的顶级列表里，见 LEGACY_CLOUD_KEYS。
 */
export const NAV_ITEMS = [
  { key: "devices", label: "Devices", icon: "▣" },
  { key: "otaSupport", label: "OTA", icon: "⟲" },
  { key: "licenses", label: "License", icon: "☑" },
  // 阶段"四端产品体系 V1"§7 新增：分布式调度——展示未来由 Operator
  // Cloud 调度经营者 Mac mini 空闲算力的架构预留能力，本轮全部只读
  // 模拟数据，distributedCompute.enabled 恒为 false。
  { key: "distributedScheduling", label: "Nodes", icon: "⟁" },
];

/** Retired top-level keys that stay individually resolvable (still real pages in PAGE_COMPONENTS). */
export const LEGACY_CLOUD_KEYS = ["overview", "operators", "tokenMetering"];

export function isValidCloudNavKey(key) {
  return NAV_ITEMS.some((item) => item.key === key) || LEGACY_CLOUD_KEYS.includes(key);
}
