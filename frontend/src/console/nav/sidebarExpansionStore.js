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
