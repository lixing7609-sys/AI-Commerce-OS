/**
 * Operator Cloud 一级导航的唯一权威列表（阶段：路由/页面修复）。
 * 与 Founder 的 console/nav/navConfig.js、Operator 的
 * helpers/navigation.js 同一个原则：拆到独立文件，既是为了让
 * CloudConsoleApp.jsx 能同时导出组件和这份纯数据而不触发 React
 * Fast Refresh 的 lint 规则，也是为了能被测试单独 import。
 */
export const NAV_ITEMS = [
  { key: "overview", label: "总览", icon: "◆" },
  { key: "operators", label: "经营者", icon: "◐" },
  { key: "devices", label: "设备", icon: "▣" },
  { key: "licenses", label: "许可与套餐", icon: "☑" },
  { key: "tokenMetering", label: "Token 计量", icon: "◔" },
  { key: "otaSupport", label: "OTA 与支持", icon: "⟲" },
  // 阶段"四端产品体系 V1"§7 新增：分布式调度——展示未来由 Operator
  // Cloud 调度经营者 Mac mini 空闲算力的架构预留能力，本轮全部只读
  // 模拟数据，distributedCompute.enabled 恒为 false。
  { key: "distributedScheduling", label: "分布式调度", icon: "⟁" },
];

export function isValidCloudNavKey(key) {
  return NAV_ITEMS.some((item) => item.key === key);
}
