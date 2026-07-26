/**
 * 经营者版一级导航定义（阶段：路由/页面修复 + 品牌统一）。
 *
 * 与 Founder 的 console/nav/navConfig.js 同一个原则：这是唯一权威
 * 列表，侧边栏、底部导航、抽屉导航都从这里读取，不在别处重复定义
 * 模块 key。13 项客户最终导航结构：
 *   今日经营 / AI 秘书 / 店铺 / 商品 / 内容 / 订单 / 客服 / 审批 /
 *   AI 成长 / 成本与 Token / 设备与更新 / 数据与隐私 / 设置
 *
 * 商品/内容/订单/客服/审批这 5 项在 Founder 版已有完整实现
 * （productCenter/contentCenter/orderCenter/customerServiceCenter/
 * approvalCenter），经营者版目前是"即将上线"骨架页（见
 * pages/ComingSoonPage.jsx）而不是完整实现——诚实标注，不是空白/
 * 报错页。之前版本里的"成果"（deliverables）和"业务记忆"
 * （memory）不在这份最终结构里，页面组件仍保留在代码库中，只是不
 * 再出现在一级导航——不是删除功能，是这次导航收敛的范围决定。
 */
export const OPERATOR_NAV_ITEMS = [
  { key: "dashboard", label: "今日经营", icon: "◆", status: "ready" },
  { key: "secretary", label: "AI 秘书", icon: "☑", status: "ready" },
  { key: "shops", label: "店铺", icon: "▽", status: "ready" },
  { key: "products", label: "商品", icon: "▣", status: "comingSoon" },
  { key: "content", label: "内容", icon: "▥", status: "comingSoon" },
  { key: "orders", label: "订单", icon: "▤", status: "comingSoon" },
  { key: "customerService", label: "客服", icon: "⟲", status: "comingSoon" },
  { key: "approvals", label: "审批", icon: "☑", status: "comingSoon" },
  { key: "growth", label: "AI 成长", icon: "↗", status: "ready" },
  { key: "costToken", label: "成本与 Token", icon: "◔", status: "ready" },
  { key: "deviceUpdates", label: "设备与更新", icon: "▣", status: "ready" },
  { key: "dataPrivacy", label: "数据与隐私", icon: "⛨", status: "ready" },
  { key: "settings", label: "设置", icon: "⚙", status: "ready" },
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
