/**
 * 独立 Studio 侧边栏手风琴展开状态的 localStorage 持久化（阶段：
 * Studio V3 Integration §六）。与 Founder 的
 * console/nav/sidebarExpansionStore.js 同一个模式，但物理上独立一份
 * ——Studio 不允许 import console/（edition boundary），两处代码同构
 * 不算重复实现，是同一个约定在两个不同 host 里各自的必要落地。
 */
const STORAGE_KEY = "ai-commerce-os:studio:sidebar-expanded-group";

export function getStoredExpandedGroup() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

export function setStoredExpandedGroup(groupKey) {
  try {
    if (groupKey) window.localStorage.setItem(STORAGE_KEY, groupKey);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 隐私模式/容量超限时静默忽略。
  }
}
