/**
 * 全局店铺范围偏好（阶段 8E）。
 *
 * 只保存"当前选择查看哪个店铺范围"这一个普通 UI 偏好，绝不保存
 * 任何 Secret；写入 localStorage 的值只是 shop id（数字）或固定
 * 字符串 "all" / "unassigned"，不含任何敏感信息。
 *
 * 范围语义：
 * - "all"：全部店铺，仅用于经营者查看跨店汇总展示（首页/任务
 *   中心/成果中心的只读筛选），绝不能作为创建任务时的 shop_id
 *   传给后端——创建任务必须显式选择具体店铺或"未绑定店铺"。
 * - "unassigned"：只看未绑定店铺的记录。
 * - 数字 id：具体店铺。
 */

const STORAGE_KEY = "ai-commerce-os:shop-scope";

export const ALL_SHOPS_SCOPE = "all";
export const UNASSIGNED_SHOP_SCOPE = "unassigned";

export function getStoredShopScope() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return ALL_SHOPS_SCOPE;
    if (raw === ALL_SHOPS_SCOPE || raw === UNASSIGNED_SHOP_SCOPE) return raw;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : ALL_SHOPS_SCOPE;
  } catch {
    return ALL_SHOPS_SCOPE;
  }
}

export function setStoredShopScope(scope) {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(scope));
  } catch {
    // 隐私模式或存储不可用时静默忽略，不影响当前会话内的筛选。
  }
}

/**
 * 把当前范围转换为 GET /tasks 或 GET /deliverables 查询参数。
 * ALL_SHOPS_SCOPE 返回空对象（不筛选，仅用于只读汇总展示）。
 */
export function shopScopeToQueryParams(scope) {
  if (scope === ALL_SHOPS_SCOPE) {
    return {};
  }
  if (scope === UNASSIGNED_SHOP_SCOPE) {
    return { unassignedShop: true };
  }
  return { shopId: scope };
}
