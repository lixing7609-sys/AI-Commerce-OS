/**
 * Founder 侧边栏手风琴展开状态持久化（阶段 M8c §3）——只存一个 group
 * key（单一展开分组模式），不涉及任何业务数据/凭证，localStorage
 * 落地和 `store/shopScopeStore.js` 同一个既有约定，纯粹是"刷新后
 * 恢复当前展开状态"这个 UX 要求，不是需要脱敏的内容。
 */
const STORAGE_KEY = "ai-commerce-os:founder:sidebar-expanded-group";

export function getStoredExpandedGroup() {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredExpandedGroup(groupKey) {
  try {
    if (groupKey) {
      window.localStorage.setItem(STORAGE_KEY, groupKey);
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // 隐私模式/容量超限时静默忽略——展开状态只在当前会话内存中生效。
  }
}

/**
 * Design DNA v1.1 collapsed icon-rail persistence — same mechanism/
 * storage convention as the accordion state above, not a new global
 * state solution (spec explicitly asks to reuse the existing
 * preference mechanism rather than add a fragile new one).
 */
const COLLAPSED_STORAGE_KEY = "ai-commerce-os:founder:sidebar-collapsed";

export function getStoredSidebarCollapsed() {
  try {
    return window.localStorage.getItem(COLLAPSED_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setStoredSidebarCollapsed(collapsed) {
  try {
    if (collapsed) {
      window.localStorage.setItem(COLLAPSED_STORAGE_KEY, "1");
    } else {
      window.localStorage.removeItem(COLLAPSED_STORAGE_KEY);
    }
  } catch {
    // Same silent-ignore rationale as setStoredExpandedGroup above.
  }
}
