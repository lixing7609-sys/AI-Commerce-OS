/**
 * 经营者版原型的通用展示格式化工具。
 *
 * 核心原则（阶段：产品原型）：
 * - 真实数据缺失时统一显示"尚未接入"，绝不显示伪造的 0 元/0 单；
 * - 演示数据统一显示"原型数据"标记，不与真实数据混合而不做标记；
 * - Task ID 类开发标识不作为业务标题使用，只在"开发信息"折叠区展示。
 */

export const NOT_CONNECTED_LABEL = "尚未接入";
export const DEMO_BADGE_LABEL = "原型数据";

/**
 * 格式化一个"可能尚未接入真实数据"的指标值。
 *
 * @param {{value: number|string|null|undefined, isDemo: boolean, connected: boolean}} input
 * @returns {{text: string, badge: string|null}}
 */
export function formatMetricValue({ value, isDemo = false, connected = true }) {
  if (!connected || value === null || value === undefined) {
    return { text: NOT_CONNECTED_LABEL, badge: null };
  }

  return {
    text: String(value),
    badge: isDemo ? DEMO_BADGE_LABEL : null,
  };
}

/**
 * 判断一组数据是否应该显示"原型数据"标记：只要数组中存在
 * is_demo=true 的条目就需要标记，防止真实数据和演示数据混合
 * 展示却不提示用户。
 */
export function shouldShowDemoBadge(items) {
  if (!items) return false;
  const list = Array.isArray(items) ? items : [items];
  return list.some((item) => item?.is_demo === true);
}

/**
 * 业务标题优先：给定一个可能带有开发用 Task ID 的业务对象，
 * 返回适合作为卡片标题的文本——绝不直接返回形如 "TASK-XXXX" 的
 * 开发标识。
 */
export function getBusinessTitle(item, fallback = "未命名工作") {
  if (item?.title && !isDevTaskIdLike(item.title)) {
    return item.title;
  }
  return fallback;
}

const DEV_TASK_ID_PATTERN = /^TASK-[A-Z0-9]+$/;

export function isDevTaskIdLike(text) {
  return typeof text === "string" && DEV_TASK_ID_PATTERN.test(text.trim());
}

const HEALTH_LABELS = {
  normal: "正常",
  attention: "需要关注",
  error: "异常",
  not_connected: "尚未接入",
  expiring: "授权即将到期",
};

export function getShopHealthLabel(health) {
  return HEALTH_LABELS[health] ?? "未知";
}

export function scopeLabelFor(scope, shops, { allLabel = "全部店铺", unassignedLabel = "未绑定店铺" } = {}) {
  if (scope === "all") return allLabel;
  if (scope === "unassigned") return unassignedLabel;
  const shop = shops.find((item) => String(item.id ?? item.shop_code) === String(scope));
  return shop ? shop.name ?? shop.shop_name : allLabel;
}

const CHANGE_FORMATTER = new Intl.NumberFormat("zh-CN", {
  style: "percent",
  maximumFractionDigits: 1,
  signDisplay: "exceptZero",
});

export function formatChangeVsYesterday(change) {
  if (change === null || change === undefined) return NOT_CONNECTED_LABEL;
  return CHANGE_FORMATTER.format(change);
}
