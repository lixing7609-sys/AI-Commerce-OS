/**
 * 系统设置分组定义（阶段：产品原型）。
 *
 * 拆成独立文件，供 SettingsPage 渲染和测试共用——测试需要断言
 * "开发与文档"（原知识库工程文档）确实收纳进系统设置，且经营者
 * 主导航（见 navigation.js）不再包含这些分组名称。
 */
export const SETTINGS_GROUPS = [
  { key: "model", label: "AI模型" },
  { key: "runtime", label: "系统运行" },
  { key: "automation", label: "自动化" },
  { key: "messaging", label: "消息入口" },
  { key: "security", label: "安全" },
  { key: "docs", label: "开发与文档" },
  { key: "logs", label: "系统日志" },
];

export function hasSettingsGroup(key) {
  return SETTINGS_GROUPS.some((group) => group.key === key);
}
