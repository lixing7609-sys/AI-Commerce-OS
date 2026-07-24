/**
 * 演示数据基础设施：延迟模拟、is_demo 标记、localStorage 持久化
 * 的 mock 仓库。所有本模块的 mock 值都应该带 is_demo: true，UI
 * 上也要有可见的"演示数据"标记（见 kit/StatusPill.jsx 的
 * DemoBadge）——这是模拟数据也是给未来接入真实后端的字段占位。
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

const STORAGE_PREFIX = "ai-commerce-os:founder:";

/**
 * 创建一个以 localStorage 为后端的简单 mock 仓库：get()/set()/
 * reset()。用于 Agent Studio / Model Router / Prompt-Skill Studio
 * 之间共享、且必须"跨刷新/跨导航仍然可见"的编辑状态（阶段
 * Founder Alpha 的硬性要求）。仓库整体以 JSON 存一个 key，不做
 * 增量 diff——数据量在这个场景下很小，没必要做更复杂的存储。
 */
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

/**
 * 生成 mock id。不能用一个从固定起点开始、每次刷新页面都重置的
 * 内存计数器——本模块的种子数据一旦生成就会写入 localStorage
 * 长期保存，而不同 mock 仓库（Agent Studio 的运行历史、商品、
 * Prompt 等）各自独立首次访问时才生成种子，可能发生在不同的
 * 页面会话里；如果计数器每次都从同一个起点重新数，两个不同会话
 * 生成的 id 就会撞在一起（真实发现的 bug：两个 Agent 的运行历史
 * 各自在不同会话首次生成时都从 run-1001 开始，写入 localStorage
 * 后成为同名 React key）。用时间戳 + 随机后缀，不需要跨会话持久化
 * 计数器状态也能保证不重复。
 */
export function nextMockId(prefix = "m") {
  const time = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${time}${random}`;
}
