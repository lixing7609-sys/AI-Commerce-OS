/**
 * 四个产品端（Founder / Operator / Cloud / Studio）共用的最小 mock
 * 基础设施——延迟模拟、演示数据标记、localStorage 仓库。刻意从
 * frontend/src/console/mock/mockUtils.js 里独立出一份，而不是让
 * operator-preview/ / cloud/ / studio/ 反向 import console/ 内部
 * 实现：console/ 是 Founder Edition 专属目录（scripts/editions/
 * manifest.py 从未把它列入任何客户发行包），其它端引用它会破坏既有
 * Edition 边界。frontend/src/shared/ 是四者都被允许依赖的公共层
 * （manifest.py 已相应更新 operator 的 include 前缀）。
 */

export function simulateLatency(min = 150, max = 420) {
  const delay = min + Math.random() * (max - min);
  return new Promise((resolve) => window.setTimeout(resolve, delay));
}

export function tagDemo(value) {
  if (Array.isArray(value)) {
    return value.map((item) => tagDemo(item));
  }
  if (value && typeof value === "object") {
    return { ...value, is_demo: true };
  }
  return value;
}

const STORAGE_PREFIX = "ai-commerce-os:shared:";

export function createLocalRepository(key, seedFactory) {
  const storageKey = `${STORAGE_PREFIX}${key}`;

  function read() {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) return JSON.parse(raw);
    } catch {
      // 存储不可用或数据损坏时退回种子数据，不阻塞页面渲染。
    }
    const seed = seedFactory();
    write(seed);
    return seed;
  }

  function write(value) {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(value));
    } catch {
      // 隐私模式/容量超限时静默忽略——本次编辑只在当前会话内存中生效。
    }
  }

  return {
    get: read,
    set: write,
    update(updater) {
      const next = updater(read());
      write(next);
      return next;
    },
    reset() {
      const seed = seedFactory();
      write(seed);
      return seed;
    },
  };
}

export function nextMockId(prefix = "m") {
  const time = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${time}${random}`;
}
