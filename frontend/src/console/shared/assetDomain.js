import { createLocalRepository, nextMockId, tagDemo } from "../mock/mockUtils.js";

/**
 * Founder 核心资产中心（Prompt/Skill/Knowledge/Connector）共用的
 * 领域模型 + 仓库适配层（阶段 Founder Full-System v3 Batch 2 §F）。
 *
 * 交办任务要求这四个中心"使用统一对象ID、统一创建时间和更新时间、
 * 数据适配层"，不是四份各自为政的实现——所以这里只定义一次资产的
 * 通用形状（id/name/description/status/version/tags/createdAt/
 * updatedAt + `fields`：每个中心自己的专属字段，作为一个自由字典，
 * 不强行统一成同一张表）。真正的读写走 `createAssetRepository()`，
 * 每个中心传入自己的 storageKey + 种子数据，互不共享存储。
 */

export const ASSET_STATUS = Object.freeze({
  DRAFT: "draft",
  PUBLISHED: "published",
  ARCHIVED: "archived",
});

export const ASSET_STATUS_LABEL = {
  [ASSET_STATUS.DRAFT]: "草稿",
  [ASSET_STATUS.PUBLISHED]: "已发布",
  [ASSET_STATUS.ARCHIVED]: "已归档",
};

export const ASSET_STATUS_TONE = {
  [ASSET_STATUS.DRAFT]: "neutral",
  [ASSET_STATUS.PUBLISHED]: "success",
  [ASSET_STATUS.ARCHIVED]: "warning",
};

export function createAsset({ name, description = "", status = ASSET_STATUS.DRAFT, tags = [], fields = {} }) {
  const now = new Date().toISOString();
  return {
    id: nextMockId("asset"),
    name,
    description,
    status,
    version: 1,
    tags,
    fields,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * 创建一个资产中心专用的 mock 仓库——list()支持 search/status 筛选，
 * get()按 id 取详情，create()/update()/remove() 都会维护
 * updatedAt/version，不需要每个中心各自重复这套逻辑。
 */
export function createAssetRepository(storageKey, seedFactory) {
  const repo = createLocalRepository(storageKey, () => tagDemo(seedFactory()));

  function list({ search, status } = {}) {
    let rows = repo.get();
    if (!Array.isArray(rows)) rows = [];
    if (status && status !== "all") rows = rows.filter((a) => a.status === status);
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter((a) => a.name.toLowerCase().includes(q) || (a.description ?? "").toLowerCase().includes(q));
    }
    return rows;
  }

  function get(id) {
    const rows = repo.get();
    return (Array.isArray(rows) ? rows : []).find((a) => a.id === id) ?? null;
  }

  function create(draft) {
    const asset = createAsset(draft);
    return repo.update((rows) => [...(Array.isArray(rows) ? rows : []), asset]);
  }

  function update(id, patch) {
    return repo.update((rows) =>
      (Array.isArray(rows) ? rows : []).map((a) =>
        a.id === id ? { ...a, ...patch, updatedAt: new Date().toISOString(), version: (a.version ?? 1) + 1 } : a
      )
    );
  }

  function remove(id) {
    return repo.update((rows) => (Array.isArray(rows) ? rows : []).filter((a) => a.id !== id));
  }

  return { list, get, create, update, remove, reset: repo.reset };
}
