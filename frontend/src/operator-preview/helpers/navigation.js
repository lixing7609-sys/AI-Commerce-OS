/**
 * 经营者版一级导航定义（阶段：产品原型）。
 *
 * 只保留六项，全部使用中文业务语言，不出现 RuntimeEngine/Task/
 * Agent role 等开发术语。抽成纯数据 + 纯函数，方便测试且避免在
 * 导航组件、底部导航、抽屉导航之间重复维护同一份列表。
 */
export const OPERATOR_NAV_ITEMS = [
  { key: "dashboard", label: "经营驾驶舱", icon: "◆" },
  { key: "shops", label: "店铺", icon: "▽" },
  { key: "secretary", label: "AI秘书处", icon: "☑" },
  { key: "deliverables", label: "成果", icon: "✔" },
  { key: "memory", label: "业务记忆", icon: "▣" },
  { key: "growth", label: "AI 成长", icon: "↗" },
  { key: "settings", label: "系统设置", icon: "⚙" },
];

const FORBIDDEN_DEV_TERMS = [
  "RuntimeEngine",
  "Task",
  "Agent",
  "role",
  "Consumer",
  "migration",
];

/**
 * 校验导航项文案不含开发者术语（供测试使用），避免未来有人
 * 在这份列表里不小心加回"任务中心"、"Agent"这类字眼。
 */
export function containsForbiddenDevTerms(text) {
  return FORBIDDEN_DEV_TERMS.some((term) => text.includes(term));
}

export function getNavItemByKey(key) {
  return OPERATOR_NAV_ITEMS.find((item) => item.key === key) ?? null;
}

export function isValidNavKey(key) {
  return OPERATOR_NAV_ITEMS.some((item) => item.key === key);
}
